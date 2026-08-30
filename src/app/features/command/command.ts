import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild
} from '@angular/core';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  Subscription,
  of,
  throwError
} from 'rxjs';

import {
  catchError,
  switchMap
} from 'rxjs/operators';

import { NgTemplateOutlet } from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  ActivatedRoute,
  Router
} from '@angular/router';

import {
  AgentCallEvent,
  agentCallFromDapta,
  DaptaBatchPoll,
  isCallFinished,
  phoneDigits,
  uniquePhoneNumbers
} from '../../core/models/call-batch';

import {
  Carrier,
  carrierRoutes
} from '../../core/models/carrier';

import {
  Client
} from '../../core/models/client';

import {
  CreateOperationRequest,
  MandateNormalizeField,
  NormalizeMandateValueResponse,
  Operation,
  emptyCreateOperationRequest
} from '../../core/models/operation';

import {
  Quote
} from '../../core/models/quote';

import {
  LogisticsApi
} from '../../core/services/logistics.api';

import {
  AuthService
} from '../../core/auth/auth.service';

import {
  AnalyticsKpis,
  emptyAnalyticsKpis
} from '../../core/models/analytics';

import {
  formatMoney as formatMoneyAmount,
  formatShortDate
} from '../../core/utils/format';

import {
  readErrorDetail
} from '../../core/utils/http-error';

import {
  isCountryOnlyPlace,
  isUnknownOrSkipAnswer,
  localNormalizedValue
} from '../../core/utils/mandate-normalize';

import {
  LucideCircleCheck,
  LucideDynamicIcon,
  LucideSend,
  LucideTrendingUp
} from '@lucide/angular';

interface ComposerChip {
  label: string;
  run: () => void;
  mark?: string;
}

interface ContextTag {
  key: string;
  label: string;
  value: string;
}


const POLL_INTERVAL_MS = 5000;

// Give up on a batch after ten minutes of polling.
const MAX_POLL_ATTEMPTS = (10 * 60 * 1000) / POLL_INTERVAL_MS;

const MAX_POLL_FAILURES = 3;

const MAX_DISPATCH_CARRIERS = 5;


function laneCode(
  origin: string,
  destination: string
): string {
  return `${origin}-${destination}`.trim().toUpperCase().replace(/\s+/g, '');
}


function extraVariablesFromOperation(
  operation: Operation
): Record<string, string> {
  const extra: Record<string, string> = {};
  const clientId = (operation.client_id || operation.keys?.[0] || '').trim();
  const operationId = (operation.id || '').trim();
  if (clientId) extra['client_id'] = clientId;
  if (operationId) extra['operation_id'] = operationId;
  return extra;
}


function uniqueCarriersByPhone(
  carriers: Carrier[]
): Carrier[] {
  const seen = new Set<string>();
  const unique: Carrier[] = [];
  for (const carrier of carriers) {
    const digits = phoneDigits(carrier.phone);
    if (!digits || seen.has(digits)) {
      continue;
    }
    seen.add(digits);
    unique.push(carrier);
  }
  return unique;
}


function pickCarriersForLane(
  carriers: Carrier[],
  origin: string,
  destination: string
): Carrier[] {
  const reachable = uniqueCarriersByPhone(
    carriers.filter((carrier) => phoneDigits(carrier.phone))
  );
  const lane = laneCode(origin, destination);
  const onLane = reachable.filter((carrier) =>
    carrierRoutes(carrier).some(
      (route) => route.trim().toUpperCase().replace(/\s+/g, '') === lane
    )
  );
  return (onLane.length ? onLane : reachable).slice(0, MAX_DISPATCH_CARRIERS);
}

type CallTone = 'ok' | 'bad' | 'live';


function sameClient(
  left: Client,
  right: Client
): boolean {
  if (left.id && right.id && left.id === right.id) {
    return true;
  }
  const phone = (left.contact_phone ?? '').replace(/\D/g, '');
  const email = (left.contact_email ?? '').trim().toLowerCase();
  const samePhone =
    Boolean(phone) && phone === (right.contact_phone ?? '').replace(/\D/g, '');
  const sameEmail =
    Boolean(email) &&
    email !== 'undefined' &&
    email === (right.contact_email ?? '').trim().toLowerCase();
  return samePhone || sameEmail;
}


type Step =
  | 'client'
  | 'currency'
  | 'origin'
  | 'destination'
  | 'cargo_category'
  | 'hazmat'
  | 'container_size'
  | 'container_type'
  | 'weight'
  | 'chassis'
  | 'date'
  | 'pickup_window'
  | 'last_free_day'
  | 'price'
  | 'review'
  | 'created';

const STEP_ORDER: Step[] = [
  'client',
  'currency',
  'origin',
  'destination',
  'cargo_category',
  'hazmat',
  'container_size',
  'container_type',
  'weight',
  'chassis',
  'date',
  'pickup_window',
  'last_free_day',
  'price',
  'review',
  'created',
];

const OTHER_CHOICE = 'Other';

const SKIPPABLE_STEPS = new Set<Step>([
  'container_size',
  'container_type',
  'weight',
  'chassis',
  'pickup_window',
  'last_free_day',
]);


@Component({
  selector: 'app-command',
  standalone: true,

  imports: [
    FormsModule,
    LucideDynamicIcon,
    NgTemplateOutlet
  ],

  templateUrl: './command.html',
  styleUrl: './command.css',

  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
  }
})
export class Command implements OnDestroy {

  clients: Client[] = [];

  operation: CreateOperationRequest =
    emptyCreateOperationRequest();

  createdOperation: Operation | null =
    null;

  selectedClient: Client | null =
    null;

  step: Step =
    'client';

  loadingClients =
    false;

  creatingOperation =
    false;

  loadingDeal =
    false;

  openedFromDeal =
    false;

  isTyping =
    false;

  errorMessage =
    '';

  retryAsk =
    '';

  rejectedAnswer =
    '';

  skippedSteps: Partial<Record<Step, string>> =
    {};

  clientSearch =
    '';

  isClientSession =
    false;

  agentCalls: AgentCallEvent[] =
    [];

  quotes: Quote[] =
    [];

  dispatching =
    false;

  callsFinished =
    false;

  dispatchError =
    '';

  pollingError =
    '';


  private batchId =
    '';

  private carriersByPhone = new Map<string, Pick<AgentCallEvent, 'carrier_id' | 'carrier_name'>>();

  private typingTimer:
    ReturnType<typeof setTimeout> | null =
      null;

  private pollTimer:
    ReturnType<typeof setInterval> | null =
      null;

  private pollDelay:
    ReturnType<typeof setTimeout> | null =
      null;

  private pollAttempts =
    0;

  private pollFailures =
    0;

  private startCallsSub:
    Subscription | null =
      null;


  readonly currencySuggestions = [
    'MXN',
    'USD',
    'COP'
  ];


  readonly originSuggestions = [
    'Manzanillo',
    'Veracruz',
    'Lázaro Cárdenas'
  ];


  readonly destinationSuggestions = [
    'Guadalajara',
    'Monterrey',
    'Mexico City'
  ];

  readonly otherChoice = OTHER_CHOICE;

  writingOther = false;

  otherDraft = '';

  private normalizeSub: Subscription | null = null;

  private dealLoadSub: Subscription | null = null;

  private loadingDealId = '';


  readonly cargoSuggestions = [
    { value: 'general', label: 'General' },
    { value: 'electronics', label: 'Electronics' },
    { value: 'food', label: 'Food' }
  ];

  readonly containerSizeSuggestions = [
    { value: '20ft', label: '20ft' },
    { value: '40ft', label: '40ft' },
    { value: '40HC', label: '40HC' }
  ];

  readonly containerTypeSuggestions = [
    { value: 'dry', label: 'Dry' },
    { value: 'reefer', label: 'Reefer' }
  ];

  readonly weightSuggestions = [
    { value: 10000, label: '10 t' },
    { value: 18500, label: '18.5 t' },
    { value: 22000, label: '22 t' }
  ];

  readonly pickupWindowSuggestions = [
    { value: '08:00-12:00', label: '08:00–12:00' },
    { value: '12:00-17:00', label: '12:00–17:00' },
    { value: '08:00-17:00', label: 'All day' }
  ];

  readonly priceSuggestions = [
    8500,
    12000,
    15000
  ];


  readonly dateChips = [
    { days: 1, label: 'Tomorrow' },
    { days: 3, label: 'In 3 days' },
    { days: 7, label: 'In 1 week' }
  ];

  protected readonly icons = {
    send: LucideSend,
    deals: LucideCircleCheck,
    trend: LucideTrendingUp
  };

  kpis: AnalyticsKpis = emptyAnalyticsKpis();

  @ViewChild('thread')
  private thread?: ElementRef<HTMLElement>;

  @ViewChild('composerField')
  private composerField?: ElementRef<HTMLInputElement>;


  private readonly api = inject(LogisticsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    void this.boot();
  }


  ngOnDestroy(): void {

    if (this.typingTimer) {

      clearTimeout(
        this.typingTimer
      );

    }

    this.cancelNormalize();
    this.cancelDealLoad();
    this.cancelStartCalls();
    this.stopPolling();

  }


  get greetingName(): string {
    const raw =
      this.selectedClient?.contact_name
      || this.selectedClient?.name
      || '';
    const first =
      raw.trim().split(/\s+/)[0];
    return first || 'there';
  }


  get uniqueClients(): Client[] {
    const rows = this.filteredClients;
    return rows.filter((client, index) => {
      const first = rows.findIndex((item) => sameClient(client, item));
      return first === index;
    });
  }


  get composerPlaceholder(): string {
    switch (this.step) {
      case 'client':
        return 'Search by company, contact or email';
      case 'currency':
        return 'pesos, dollars, euros…';
      case 'origin':
        return 'Pickup city or port';
      case 'destination':
        return 'Any city';
      case 'cargo_category':
        return 'e.g. textiles or chemicals';
      case 'container_size':
        return 'e.g. 40ft or 40 high cube';
      case 'container_type':
        return 'e.g. dry or reefer';
      case 'weight':
        return 'e.g. 18500 or 18.5 t';
      case 'pickup_window':
        return 'e.g. 08:00-12:00 or morning';
      case 'last_free_day':
        return 'e.g. next Wednesday';
      case 'price':
        return 'e.g. 12 mil or twelve thousand';
      case 'date':
        return 'e.g. next Friday';
      default:
        return 'Message Nauti';
    }
  }


  clientInitial(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }


  displayEmail(email: string | null | undefined): string {
    const value = (email ?? '').trim();
    if (!value || value === 'undefined' || value === 'null') {
      return '—';
    }
    return value;
  }


  after(step: Step): boolean {
    return STEP_ORDER.indexOf(this.step) > STEP_ORDER.indexOf(step);
  }


  get otherPrompt(): string {
    switch (this.step) {
      case 'currency':
        return 'Write the currency however you want. I’ll normalize it.';
      case 'origin':
        return 'Write the pickup city or port — whatever you usually call it.';
      case 'destination':
        return 'Write the destination city — whatever you usually call it.';
      case 'cargo_category':
        return 'Write the cargo type however you want. I’ll normalize it.';
      case 'container_size':
        return 'Write the container size if you have it, or say you’re not sure.';
      case 'container_type':
        return 'Write the container type if you have it, or say you’re not sure.';
      case 'weight':
        return 'Write the weight if you have it, or say you’re not sure.';
      case 'pickup_window':
        return 'Write the pickup window if you have it, or say you’re not sure.';
      case 'last_free_day':
        return 'Write the last free day if you have it, or say you’re not sure.';
      case 'price':
        return 'Write the price cap however you want. I’ll normalize it.';
      case 'date':
        return 'Write the pickup date however you want. I’ll normalize it.';
      default:
        return 'Write it however you want. I’ll normalize it.';
    }
  }


  onOtherDraft(event: Event): void {
    const field = event.target;
    if (field instanceof HTMLInputElement) {
      this.otherDraft = field.value;
    }
  }


  chooseOther(): void {
    this.writingOther = true;
    this.otherDraft = '';
    this.errorMessage = '';
    this.retryAsk = '';
    this.rejectedAnswer = '';
    this.cdr.detectChanges();
    queueMicrotask(() => {
      this.composerField?.nativeElement.focus();
      this.scrollThread();
    });
  }


  cancelOther(): void {
    this.cancelNormalize();
    this.writingOther = false;
    this.otherDraft = '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }


  submitComposer(): void {
    if (this.writingOther) {
      this.normalizeOtherAndAdvance();
      return;
    }
    switch (this.step) {
      case 'currency':
        this.submitCurrency();
        return;
      case 'origin':
        this.submitOrigin();
        return;
      case 'destination':
        this.submitDestination();
        return;
      case 'price':
        this.submitPrice();
        return;
      case 'date':
        this.submitDate();
        return;
      default:
        return;
    }
  }


  private cancelNormalize(): void {
    this.normalizeSub?.unsubscribe();
    this.normalizeSub = null;
  }


  private normalizeFieldForStep(): MandateNormalizeField | null {
    switch (this.step) {
      case 'currency':
      case 'origin':
      case 'destination':
      case 'cargo_category':
      case 'container_size':
      case 'container_type':
      case 'pickup_window':
      case 'last_free_day':
      case 'price':
      case 'date':
        return this.step;
      case 'weight':
        return 'weight_kg';
      default:
        return null;
    }
  }


  private typedOtherValue(): string {
    const fromInput = this.composerField?.nativeElement.value ?? '';
    return (fromInput || this.otherDraft).trim();
  }


  private normalizeOtherAndAdvance(): void {
    const field = this.normalizeFieldForStep();
    const text = this.typedOtherValue();
    if (!field) {
      return;
    }
    if (!text) {
      this.askAgain(this.retryQuestion(field));
      return;
    }

    if (isUnknownOrSkipAnswer(text)) {
      if (this.canSkip(this.step)) {
        this.skipCurrent(text);
        return;
      }
      this.askAgain(this.needThisAsk());
      return;
    }

    this.otherDraft = text;
    if (
      (field === 'origin' || field === 'destination')
      && isCountryOnlyPlace(text)
    ) {
      this.askAgain(this.cityRetryAsk(field));
      return;
    }

    const local = localNormalizedValue(field, text);
    if (local !== null) {
      this.applyNormalizedValue({ field, raw: text, value: local });
      return;
    }

    this.cancelNormalize();
    this.errorMessage = '';
    this.isTyping = true;
    this.cdr.detectChanges();

    const today = this.toDateInputValue(new Date());
    this.normalizeSub = this.api
      .normalizeMandateValue({
        field,
        text,
        currency: this.operation.currency || undefined,
        today,
      })
      .subscribe({
        next: (normalized) => {
          this.normalizeSub = null;
          this.isTyping = false;
          this.applyNormalizedValue(normalized);
        },
        error: (error: unknown) => {
          this.normalizeSub = null;
          this.isTyping = false;
          const fallback = localNormalizedValue(field, text);
          if (fallback !== null) {
            this.applyNormalizedValue({ field, raw: text, value: fallback });
            return;
          }
          if (field === 'origin' || field === 'destination') {
            this.askAgain(this.cityRetryAsk(field));
            return;
          }
          this.askAgain(`Hmm, I didn’t catch that. ${this.retryQuestion(field)}`);
        },
      });
  }


  private applyNormalizedValue(normalized: NormalizeMandateValueResponse): void {
    this.writingOther = false;
    this.otherDraft = '';
    this.errorMessage = '';
    this.retryAsk = '';
    this.rejectedAnswer = '';
    this.rememberAnswer(this.stepForNormalizeField(normalized.field));
    switch (normalized.field) {
      case 'currency':
        this.operation.currency = normalized.value;
        this.moveToStep('origin');
        return;
      case 'origin':
        this.operation.origin = normalized.value;
        this.moveToStep('destination');
        return;
      case 'destination':
        this.operation.destination = normalized.value;
        this.moveToStep('cargo_category');
        return;
      case 'cargo_category':
        this.operation.cargo_category = normalized.value;
        this.moveToStep('hazmat');
        return;
      case 'container_size':
        this.operation.container_size = normalized.value;
        this.moveToStep('container_type');
        return;
      case 'container_type':
        this.operation.container_type = normalized.value;
        this.moveToStep('weight');
        return;
      case 'weight_kg': {
        const kilos = Number(normalized.value);
        if (!Number.isFinite(kilos) || kilos <= 0) {
          this.askAgain(`I need a weight greater than zero. ${this.retryQuestion('weight_kg')}`);
          return;
        }
        this.operation.weight_kg = kilos;
        this.moveToStep('chassis');
        return;
      }
      case 'pickup_window':
        this.operation.pickup_window = normalized.value;
        this.moveToStep('last_free_day');
        return;
      case 'last_free_day':
        this.operation.last_free_day = normalized.value;
        this.moveToStep('price');
        return;
      case 'price': {
        const amount = Number(normalized.value);
        if (!Number.isFinite(amount) || amount <= 0) {
          this.askAgain(`I need a price greater than zero. ${this.retryQuestion('price')}`);
          return;
        }
        this.operation.mandate_max_price = amount;
        this.moveToStep('review');
        return;
      }
      case 'date':
        this.operation.mandate_target_date = normalized.value;
        this.moveToStep('pickup_window');
        return;
      default:
        this.cdr.detectChanges();
    }
  }


  private scrollThread(): void {
    queueMicrotask(() => {
      const el = this.thread?.nativeElement;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    });
  }


  private async boot(): Promise<void> {
    await this.auth.whenReady();
    this.isClientSession = this.auth.role() === 'client';

    this.loadWorkspace();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.onDealParam(params.get('deal'));
      });

    const dealId = this.route.snapshot.queryParamMap.get('deal');
    if (dealId) {
      return;
    }

    if (this.isClientSession) {
      this.cdr.detectChanges();
      this.bindSessionClient();
      return;
    }

    this.loadClients();
  }


  private onDealParam(dealId: string | null): void {
    if (!dealId) {
      if (this.openedFromDeal || this.loadingDeal) {
        this.openedFromDeal = false;
        this.resetConversation();
      }
      return;
    }
    if (this.loadingDealId === dealId || this.createdOperation?.id === dealId) {
      return;
    }
    this.loadExistingDeal(dealId);
  }


  private cancelDealLoad(): void {
    this.dealLoadSub?.unsubscribe();
    this.dealLoadSub = null;
  }


  private loadExistingDeal(operationId: string): void {
    this.cancelDealLoad();
    this.cancelStartCalls();
    this.stopPolling();
    this.dispatchError = '';
    this.pollingError = '';
    this.agentCalls = [];
    this.quotes = [];
    this.callsFinished = false;
    this.batchId = '';
    this.carriersByPhone.clear();
    this.errorMessage = '';
    this.retryAsk = '';
    this.rejectedAnswer = '';
    this.skippedSteps = {};
    this.writingOther = false;
    this.isTyping = false;
    this.loadingDeal = true;
    this.loadingDealId = operationId;
    this.openedFromDeal = true;
    this.createdOperation = null;
    this.operation = emptyCreateOperationRequest();
    this.step = 'created';
    this.cdr.detectChanges();

    this.dealLoadSub = this.api.getOperation(operationId).subscribe({
      next: (operation) => {
        this.dealLoadSub = null;
        this.applyLoadedOperation(operation);
        this.loadingDeal = false;
        this.loadingDealId = '';
        this.cdr.detectChanges();
        this.api
          .listQuotes({ operation_id: operation.id })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (quotes) => {
              this.quotes = quotes ?? [];
              this.cdr.detectChanges();
              this.scrollThread();
            },
            error: () => {
              this.quotes = [];
              this.cdr.detectChanges();
            },
          });
      },
      error: () => {
        this.dealLoadSub = null;
        this.loadingDeal = false;
        this.loadingDealId = '';
        this.errorMessage = 'Could not load that deal.';
        this.openedFromDeal = false;
        this.step = this.isClientSession ? 'currency' : 'client';
        this.cdr.detectChanges();
        if (this.isClientSession && !this.selectedClient) {
          this.bindSessionClient();
        }
      },
    });
  }


  private applyLoadedOperation(operation: Operation): void {
    this.createdOperation = operation;
    this.openedFromDeal = true;
    this.operation = {
      client_id: operation.client_id,
      origin: operation.origin,
      destination: operation.destination,
      mandate_max_price: operation.mandate_max_price,
      currency: operation.currency || 'MXN',
      mandate_target_date: operation.mandate_target_date,
      cargo_category: operation.cargo_category,
      weight_kg: operation.weight_kg,
      container_size: operation.container_size,
      container_type: operation.container_type,
      hazmat: operation.hazmat,
      pickup_window: operation.pickup_window,
      last_free_day: operation.last_free_day,
      chassis_required: operation.chassis_required,
      status: operation.status,
    };
    this.selectedClient =
      operation.client
      ?? this.selectedClient
      ?? (this.isClientSession ? this.auth.appUser()?.client ?? null : null);
    if (this.selectedClient) {
      this.operation.client_id = this.selectedClient.id;
    }
    this.step = 'created';
    this.cdr.detectChanges();
    this.scrollThread();
  }


  private bindSessionClient(): void {
    const profile = this.auth.appUser();
    const nested = profile?.client ?? null;
    const clientId = this.auth.clientId();

    if (nested) {
      this.applySessionClient(nested);
      return;
    }

    if (!clientId) {
      this.beginClientChat();
      return;
    }

    this.api.getClient(clientId).subscribe({
      next: (client) => this.applySessionClient(client),
      error: () => {
        this.applySessionClient({
          id: clientId,
          name: profile?.email || 'Your company',
          contact_name: '',
          contact_phone: '',
          contact_email: profile?.email || '',
          direction: 'outbound',
        });
      },
    });
  }


  private applySessionClient(
    client: Client
  ): void {
    this.selectedClient = client;
    this.operation.client_id = client.id;
    this.beginClientChat();
  }


  private beginClientChat(): void {
    this.operation.currency = '';
    this.writingOther = false;
    this.otherDraft = '';
    this.errorMessage = '';
    this.step = 'currency';
    this.cdr.detectChanges();
    this.scrollThread();
  }


  // ==========================================
  // CHAT / TYPING
  // ==========================================

  isSkipped(step: Step): boolean {
    return Object.prototype.hasOwnProperty.call(this.skippedSteps, step);
  }


  skipReply(step: Step): string {
    return this.skippedSteps[step] || 'Not sure yet';
  }


  skipCurrent(said?: string): void {
    if (!this.canSkip(this.step)) {
      this.askAgain(this.needThisAsk());
      return;
    }
    this.skippedSteps[this.step] = (said ?? 'Not sure yet').trim() || 'Not sure yet';
    this.clearSkippableField(this.step);
    this.writingOther = false;
    this.otherDraft = '';
    this.errorMessage = '';
    this.retryAsk = '';
    this.rejectedAnswer = '';
    const next = STEP_ORDER[STEP_ORDER.indexOf(this.step) + 1];
    if (next) {
      this.moveToStep(next);
    }
  }


  private canSkip(step: Step): boolean {
    return SKIPPABLE_STEPS.has(step);
  }


  private needThisAsk(): string {
    switch (this.step) {
      case 'currency':
        return 'I need the currency so we can talk numbers with the carriers.';
      case 'origin':
        return 'I need the pickup city so we can match the lane.';
      case 'destination':
        return 'I need the destination city so we can match the lane.';
      case 'cargo_category':
        return 'I need the cargo type so the carriers know what they’re moving.';
      case 'hazmat':
        return 'I need to know if this is hazmat — yes or no.';
      case 'date':
        return 'I need a pickup date so the carriers can quote.';
      case 'price':
        return 'I need a price cap so I know how far to negotiate.';
      default:
        return this.retryQuestion(this.normalizeFieldForStep() ?? 'origin');
    }
  }


  private rememberAnswer(step: Step | null): void {
    if (!step) {
      return;
    }
    delete this.skippedSteps[step];
  }


  private stepForNormalizeField(field: MandateNormalizeField): Step {
    return field === 'weight_kg' ? 'weight' : field;
  }


  private clearSkippableField(step: Step): void {
    switch (step) {
      case 'cargo_category':
        this.operation.cargo_category = '';
        return;
      case 'hazmat':
        this.operation.hazmat = undefined;
        return;
      case 'container_size':
        this.operation.container_size = '';
        return;
      case 'container_type':
        this.operation.container_type = '';
        return;
      case 'weight':
        this.operation.weight_kg = undefined;
        return;
      case 'chassis':
        this.operation.chassis_required = undefined;
        return;
      case 'pickup_window':
        this.operation.pickup_window = '';
        return;
      case 'last_free_day':
        this.operation.last_free_day = undefined;
        return;
      default:
        return;
    }
  }


  private askAgain(
    message: string,
    rejected?: string,
  ): void {
    this.rejectedAnswer = (rejected ?? (this.typedOtherValue() || this.otherDraft)).trim();
    this.writingOther = false;
    this.otherDraft = '';
    this.errorMessage = '';
    this.isTyping = false;
    this.retryAsk = message;
    this.cdr.detectChanges();
    this.scrollThread();
  }


  private cityRetryAsk(field: MandateNormalizeField): string {
    if (field === 'origin') {
      return 'Could you share the pickup city or port? A country on its own is a bit too broad.';
    }
    return 'Could you share the destination city? A country on its own is a bit too broad.';
  }


  private retryQuestion(field: MandateNormalizeField): string {
    switch (field) {
      case 'currency':
        return 'What currency should we use?';
      case 'origin':
        return 'Where should we pick up the shipment?';
      case 'destination':
        return 'What’s the destination city?';
      case 'cargo_category':
        return 'What kind of cargo is this?';
      case 'container_size':
        return 'What container size?';
      case 'container_type':
        return 'What kind of container?';
      case 'weight_kg':
        return 'How much does it weigh?';
      case 'pickup_window':
        return 'What’s the pickup window?';
      case 'last_free_day':
        return 'What’s the last free day?';
      case 'price':
        return 'What’s the maximum price?';
      case 'date':
        return 'What’s the pickup date?';
    }
  }


  private moveToStep(
    nextStep: Step
  ): void {

    this.step =
      nextStep;

    this.writingOther =
      false;

    this.retryAsk =
      '';

    this.rejectedAnswer =
      '';

    this.isTyping =
      true;

    this.cdr.detectChanges();


    if (this.typingTimer) {

      clearTimeout(
        this.typingTimer
      );

    }


    this.typingTimer =
      setTimeout(
        () => {

          this.isTyping =
            false;

          this.cdr.detectChanges();
          this.scrollThread();

        },
        900
      );

    this.scrollThread();

  }


  // ==========================================
  // CLIENTS
  // ==========================================

  loadClients(): void {

    this.loadingClients =
      true;

    this.errorMessage =
      '';

    this.api
      .listClients()
      .subscribe({

        next: (
          clients
        ) => {

          this.clients =
            Array.isArray(clients)
              ? clients
              : [];

          this.loadingClients =
            false;

          this.cdr.detectChanges();

        },


        error: (
          error
        ) => {

          console.error(
            'Error loading clients:',
            error
          );

          this.clients =
            [];

          this.loadingClients =
            false;

          this.errorMessage =
            'Could not load clients.';

          this.cdr.detectChanges();

        }

      });

  }


  get filteredClients():
    Client[] {

    const search =
      this.clientSearch
        .trim()
        .toLowerCase();


    if (!search) {

      return this.clients;

    }


    return this.clients.filter(
      client =>

        (client.name ?? '')
          .toLowerCase()
          .includes(search)

        ||

        (client.contact_name ?? '')
          .toLowerCase()
          .includes(search)

        ||

        (client.contact_phone ?? '')
          .toLowerCase()
          .includes(search)

        ||

        (client.contact_email ?? '')
          .toLowerCase()
          .includes(search)

    );

  }


  selectClient(
    client: Client
  ): void {

    this.selectedClient =
      client;

    this.operation.client_id =
      client.id;

    this.errorMessage =
      '';

    this.moveToStep(
      'currency'
    );

  }


  // ==========================================
  // CURRENCY
  // ==========================================

  chooseCurrency(
    value: string
  ): void {

    this.operation.currency = value;
    this.submitCurrency();

  }


  submitCurrency(): void {

    const value =
      (this.operation.currency ?? '')
        .trim()
        .toUpperCase();

    if (!value) {
      this.askAgain(this.retryQuestion('currency'));
      return;
    }

    this.operation.currency = value;
    this.errorMessage = '';
    this.moveToStep('origin');

  }


  // ==========================================
  // ORIGIN
  // ==========================================

  chooseOrigin(
    value: string
  ): void {

    this.operation.origin =
      value;

    this.submitOrigin();

  }


  submitOrigin(): void {

    const value =
      this.operation.origin
        .trim();


    if (!value) {
      this.askAgain(this.retryQuestion('origin'));
      return;
    }

    if (isCountryOnlyPlace(value)) {
      this.operation.origin = '';
      this.askAgain(this.cityRetryAsk('origin'), value);
      return;
    }


    this.operation.origin =
      value;

    this.errorMessage =
      '';

    this.moveToStep(
      'destination'
    );

  }


  // ==========================================
  // DESTINATION
  // ==========================================

  chooseDestination(
    value: string
  ): void {

    this.operation.destination =
      value;

    this.submitDestination();

  }


  submitDestination(): void {

    const value =
      this.operation.destination
        .trim();


    if (!value) {
      this.askAgain(this.retryQuestion('destination'));
      return;
    }

    if (isCountryOnlyPlace(value)) {
      this.operation.destination = '';
      this.askAgain(this.cityRetryAsk('destination'), value);
      return;
    }


    this.operation.destination =
      value;

    this.errorMessage =
      '';

    this.moveToStep(
      'cargo_category'
    );

  }


  // ==========================================
  // CARGO
  // ==========================================

  chooseCargoCategory(value: string): void {
    this.operation.cargo_category = value;
    this.rememberAnswer('cargo_category');
    this.errorMessage = '';
    this.moveToStep('hazmat');
  }


  chooseHazmat(value: boolean): void {
    this.operation.hazmat = value;
    this.rememberAnswer('hazmat');
    this.errorMessage = '';
    this.moveToStep('container_size');
  }


  chooseContainerSize(value: string): void {
    this.operation.container_size = value;
    this.rememberAnswer('container_size');
    this.errorMessage = '';
    this.moveToStep('container_type');
  }


  chooseContainerType(value: string): void {
    this.operation.container_type = value;
    this.rememberAnswer('container_type');
    this.errorMessage = '';
    this.moveToStep('weight');
  }


  chooseWeight(value: number): void {
    this.operation.weight_kg = value;
    this.rememberAnswer('weight');
    this.errorMessage = '';
    this.moveToStep('chassis');
  }


  chooseChassis(value: boolean): void {
    this.operation.chassis_required = value;
    this.rememberAnswer('chassis');
    this.errorMessage = '';
    this.moveToStep('date');
  }


  // ==========================================
  // PRICE
  // ==========================================

  choosePrice(
    value: number
  ): void {

    this.operation.mandate_max_price =
      value;

    this.submitPrice();

  }


  submitPrice(): void {

    if (
      !this.operation.mandate_max_price
      ||
      this.operation.mandate_max_price <= 0
    ) {

      this.askAgain(`I need a price greater than zero. ${this.retryQuestion('price')}`);
      return;

    }


    const currency =
      (
        this.operation.currency
        ?? ''
      )
        .trim();


    if (!currency) {

      this.askAgain(this.retryQuestion('currency'));
      return;

    }


    this.operation.currency =
      currency;

    this.errorMessage =
      '';

    this.moveToStep(
      'review'
    );

  }


  // ==========================================
  // DATE
  // ==========================================

  chooseDateOffset(
    days: number
  ): void {

    const date =
      new Date();


    date.setDate(
      date.getDate()
      + days
    );


    this.operation.mandate_target_date =
      this.toDateInputValue(
        date
      );


    this.submitDate();

  }


  private toDateInputValue(
    date: Date
  ): string {

    const year =
      date.getFullYear();


    const month =
      String(
        date.getMonth() + 1
      ).padStart(
        2,
        '0'
      );


    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        '0'
      );


    return (
      `${year}-${month}-${day}`
    );

  }


  submitDate(): void {

    if (
      !this.operation
        .mandate_target_date
    ) {

      this.askAgain(this.retryQuestion('date'));
      return;

    }


    this.errorMessage =
      '';

    this.moveToStep(
      'pickup_window'
    );

  }


  get containerTypePrompt(): string {
    if (this.operation.cargo_category === 'food') {
      return 'Food often needs temperature control. Dry van or reefer?';
    }
    return 'What kind of container?';
  }


  get lastFreeDayChips(): { date: string; label: string }[] {
    const base = this.operation.mandate_target_date;
    if (!base) {
      return [];
    }
    return [
      { date: this.addDaysToIso(base, 0), label: 'Same as pickup' },
      { date: this.addDaysToIso(base, 1), label: '+1 day' },
      { date: this.addDaysToIso(base, 3), label: '+3 days' }
    ];
  }


  private addDaysToIso(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    return this.toDateInputValue(date);
  }


  choosePickupWindow(value: string): void {
    this.operation.pickup_window = value;
    this.rememberAnswer('pickup_window');
    this.errorMessage = '';
    this.moveToStep('last_free_day');
  }


  chooseLastFreeDay(value: string): void {
    this.operation.last_free_day = value;
    this.rememberAnswer('last_free_day');
    this.errorMessage = '';
    this.moveToStep('price');
  }


  chooseLastFreeDayNone(): void {
    this.operation.last_free_day = '';
    this.rememberAnswer('last_free_day');
    this.errorMessage = '';
    this.moveToStep('price');
  }


  // ==========================================
  // REVIEW
  // ==========================================

  editMandate(): void {

    this.errorMessage =
      '';

    this.moveToStep(
      'currency'
    );

  }


  resetConversation(): void {

    this.openedFromDeal =
      false;

    this.loadingDeal =
      false;

    this.loadingDealId =
      '';

    this.cancelDealLoad();

    this.operation =
      emptyCreateOperationRequest();

    this.createdOperation =
      null;

    this.writingOther =
      false;

    this.otherDraft =
      '';

    this.clientSearch =
      '';

    this.errorMessage =
      '';

    this.retryAsk =
      '';

    this.rejectedAnswer =
      '';

    this.skippedSteps =
      {};

    this.isTyping =
      false;

    this.cancelStartCalls();
    this.stopPolling();

    this.agentCalls =
      [];

    this.quotes =
      [];

    this.callsFinished =
      false;

    this.dispatchError =
      '';

    this.pollingError =
      '';

    this.batchId =
      '';

    this.carriersByPhone.clear();

    if (this.isClientSession) {
      if (this.selectedClient) {
        this.applySessionClient(this.selectedClient);
        return;
      }
      this.beginClientChat();
      return;
    }

    this.selectedClient =
      null;

    this.step =
      'client';

    this.cdr.detectChanges();

  }


  // ==========================================
  // CREATE OPERATION
  // ==========================================

  createOperation(): void {

    if (
      this.creatingOperation
    ) {

      return;

    }


    const currency =
      (
        this.operation.currency
        ?? ''
      )
        .trim();


    if (
      !this.operation.client_id
      ||
      !this.operation.origin
      ||
      !this.operation.destination
      ||
      !this.operation.cargo_category
      ||
      this.operation.hazmat === undefined
      ||
      !this.operation.mandate_max_price
      ||
      !currency
      ||
      !this.operation.mandate_target_date
    ) {

      this.errorMessage =
        'The commitment is incomplete.';

      return;

    }


    this.creatingOperation =
      true;

    this.errorMessage =
      '';


    /*
     * Command sends only the fields
     * required by the /operations endpoint.
     *
     * Deploy-specific fields such as:
     * carrier_ids
     * initial_hook
     * negotiation_style
     *
     * are intentionally not sent here.
     */
    const payload:
      CreateOperationRequest = {

      client_id:
        this.operation.client_id,

      origin:
        this.operation.origin,

      destination:
        this.operation.destination,

      mandate_max_price:
        this.operation.mandate_max_price,

      currency:
        currency,

      mandate_target_date:
        this.operation.mandate_target_date,

      cargo_category:
        this.operation.cargo_category,

      weight_kg:
        this.operation.weight_kg,

      container_size:
        this.operation.container_size || '',

      container_type:
        this.operation.container_type || '',

      hazmat:
        this.operation.hazmat,

      pickup_window:
        this.operation.pickup_window || '',

      last_free_day:
        this.operation.last_free_day ?? '',

      chassis_required:
        this.operation.chassis_required ?? false,

      status:
        'pending'

    };


    this.api
      .createOperation(
        payload
      )
      .subscribe({

        next: (
          operation
        ) => {

          this.createdOperation =
            operation;

          this.creatingOperation =
            false;

          this.step =
            'created';

          this.cdr.detectChanges();

          this.startCarrierCalls();
          this.loadWorkspace();

        },


        error: (
          error
        ) => {

          console.error(
            'Error creating operation:',
            error
          );

          this.errorMessage =
            readErrorDetail(
              error,
              'Could not create operation.'
            );

          this.creatingOperation =
            false;

          this.cdr.detectChanges();

        }

      });

  }


  // ==========================================
  // CARRIER CALLS
  // ==========================================

  retryDispatch(): void {

    if (this.createdOperation) {

      this.startCarrierCalls();

    }

  }


  resumePolling(): void {

    if (this.batchId) {

      this.pollingError =
        '';

      this.startPolling(
        this.batchId
      );

    }

  }


  private startCarrierCalls(): void {

    const operation =
      this.createdOperation;

    if (!operation || this.dispatching) {
      return;
    }

    this.cancelStartCalls();

    this.dispatching =
      true;

    this.dispatchError =
      '';

    this.pollingError =
      '';

    this.agentCalls =
      [];

    this.quotes =
      [];

    this.callsFinished =
      false;

    this.startCallsSub = this.api
      .listCarriers({
        page_size: 100
      })
      .pipe(
        switchMap((page) => {

          const carriers =
            pickCarriersForLane(
              page.items ?? [],
              operation.origin,
              operation.destination
            );

          if (carriers.length === 0) {
            return throwError(
              () => new Error('No carrier with a phone number is available for this lane.')
            );
          }

          this.rememberDirectoryCarriers(carriers);

          return this.api.startDaptaBatch({
            numbers: uniquePhoneNumbers(
              uniqueCarriersByPhone(carriers).map((carrier) => carrier.phone)
            ),
            variables: {
              origin: operation.origin,
              destination: operation.destination,
              mandate_max_price: String(operation.mandate_max_price),
              mandate_currency: operation.currency || 'MXN',
              mandate_target_date: operation.mandate_target_date,
              cargo_category: operation.cargo_category || '',
              weight_kg: operation.weight_kg != null ? String(operation.weight_kg) : '',
              container_size: operation.container_size || '',
              container_type: operation.container_type || '',
              hazmat: operation.hazmat ? 'true' : 'false',
              pickup_window: operation.pickup_window || '',
              last_free_day: operation.last_free_day || '',
              chassis_required: operation.chassis_required ? 'true' : 'false'
            },
            extra_variables: extraVariablesFromOperation(operation)
          });

        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: (
          started
        ) => {

          const batchId =
            (started.batch_id ?? '').trim();

          if (!batchId) {

            this.dispatching =
              false;

            this.dispatchError =
              'Dapta did not return a batch id.';

            this.cdr.detectChanges();

            return;

          }

          this.dispatching =
            false;

          this.batchId =
            batchId;

          this.startPolling(
            batchId
          );

          this.cdr.detectChanges();
          this.scrollThread();

        },


        error: (
          error
        ) => {

          console.error(
            'Error starting carrier calls:',
            error
          );

          this.dispatching =
            false;

          this.dispatchError =
            error instanceof Error
              ? error.message
              : readErrorDetail(
                  error,
                  'Could not reach the carriers.'
                );

          this.cdr.detectChanges();

        }

      });

  }


  private rememberDirectoryCarriers(
    carriers: Carrier[]
  ): void {

    this.carriersByPhone.clear();

    for (const carrier of carriers) {
      const digits = phoneDigits(carrier.phone);
      if (digits) {
        this.carriersByPhone.set(digits, {
          carrier_id: carrier.id,
          carrier_name: carrier.name
        });
      }
    }

  }


  private cancelStartCalls(): void {

    this.startCallsSub?.unsubscribe();
    this.startCallsSub =
      null;

  }


  private applyDaptaPoll(
    poll: DaptaBatchPoll
  ): void {

    const rows = poll.calls ?? [];
    if (rows.length === 0) {
      return;
    }

    const byPhone = new Map<string, AgentCallEvent>();
    for (const row of rows) {
      const call = agentCallFromDapta(
        row,
        this.carriersByPhone.get(phoneDigits(row.phone_number))
      );
      const key = phoneDigits(call.phone_number) || call.call_id;
      if (key) {
        byPhone.set(key, call);
      }
    }

    this.agentCalls = [...byPhone.values()];

    this.callsFinished =
      this.agentCalls.length > 0
      && this.agentCalls.every((call) => isCallFinished(call.status));

  }


  private startPolling(
    batchId: string
  ): void {

    this.stopPolling();

    this.pollAttempts =
      0;

    this.pollFailures =
      0;

    this.pollDelay =
      setTimeout(
        () => {
          this.pollDelay = null;
          this.pollBatch(batchId);
          this.pollTimer = setInterval(
            () => this.pollBatch(batchId),
            POLL_INTERVAL_MS
          );
        },
        POLL_INTERVAL_MS
      );

  }


  private stopPolling(): void {

    if (this.pollDelay) {

      clearTimeout(
        this.pollDelay
      );

      this.pollDelay =
        null;

    }

    if (this.pollTimer) {

      clearInterval(
        this.pollTimer
      );

      this.pollTimer =
        null;

    }

  }


  private pollBatch(
    batchId: string
  ): void {

    this.pollAttempts += 1;

    if (this.pollAttempts > MAX_POLL_ATTEMPTS) {

      this.stopPolling();

      this.pollingError =
        'The carrier calls are taking longer than expected. Check Negotiations for updates.';

      this.cdr.detectChanges();

      return;

    }

    this.api
      .pollDaptaBatch(
        batchId
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: (
          poll
        ) => {

          this.pollFailures =
            0;

          this.applyDaptaPoll(
            poll
          );

          if (this.callsFinished) {

            this.stopPolling();
            this.loadQuotes();

          }

          this.cdr.detectChanges();
          this.scrollThread();

        },


        error: (
          error
        ) => {

          this.pollFailures += 1;

          if (this.pollFailures < MAX_POLL_FAILURES) {

            console.warn(
              `Carrier call poll ${this.pollFailures} failed, retrying:`,
              error
            );

            return;

          }

          console.error(
            'Error polling carrier calls:',
            error
          );

          this.stopPolling();

          this.pollingError =
            readErrorDetail(
              error,
              'Lost track of the carrier calls.'
            );

          this.cdr.detectChanges();

        }

      });

  }


  private loadQuotes(): void {

    const operationId =
      this.createdOperation?.id;

    if (!operationId) {
      return;
    }

    this.api
      .listQuotes({
        operation_id: operationId
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

        next: (
          quotes
        ) => {

          this.quotes =
            quotes ?? [];

          this.cdr.detectChanges();
          this.scrollThread();

        },


        error: (
          error
        ) => {

          console.warn(
            'Could not load quotes after the carrier calls finished:',
            error
          );

        }

      });

  }


  callStatusLabel(
    status: string
  ): string {

    switch (status) {
      case 'pending':
        return 'Dialing';
      case 'in_progress':
      case 'ongoing':
        return 'On the call';
      case 'finished':
        return 'Call done';
      case 'failed':
      case 'error':
        return 'Not connected';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status || 'Queued';
    }

  }


  callDotClass(
    status: string
  ): string {

    const tones: Record<CallTone, string> = {
      ok: 'bg-neon',
      bad: 'bg-danger',
      live: 'cmd-pulse bg-amber'
    };

    return tones[this.callTone(status)];

  }


  callBadgeClass(
    status: string
  ): string {

    const tones: Record<CallTone, string> = {
      ok: 'border-neon/40 bg-neon/10 text-neon',
      bad: 'border-danger/40 bg-danger/10 text-danger',
      live: 'border-amber/40 bg-amber/10 text-amber'
    };

    return tones[this.callTone(status)];

  }


  private callTone(
    status: string
  ): CallTone {

    if (status === 'finished') {
      return 'ok';
    }

    return isCallFinished(status) ? 'bad' : 'live';

  }


  carrierLabel(
    call: AgentCallEvent
  ): string {
    return call.carrier_name || call.phone_number || 'Carrier';
  }


  quoteCarrierLabel(
    quote: Quote
  ): string {
    return quote.carrier?.name || quote.carrier?.owner_name || 'Carrier';
  }


  // ==========================================
  // FORMAT MONEY
  // ==========================================

  formatMoney(
    value: number,
    currency?: string
  ): string {
    return formatMoneyAmount(
      value,
      currency || this.operation.currency || 'MXN'
    );
  }


  formatDate(
    value: string | null | undefined
  ): string {
    return formatShortDate(value);
  }


  formatCargo(value: string | null | undefined): string {
    const labels: Record<string, string> = {
      general: 'General',
      electronics: 'Electronics',
      food: 'Food'
    };
    const key = (value ?? '').trim();
    return labels[key] || key || '—';
  }


  formatContainerType(value: string | null | undefined): string {
    const labels: Record<string, string> = {
      dry: 'Dry',
      reefer: 'Reefer'
    };
    const key = (value ?? '').trim();
    return labels[key] || key || '—';
  }


  formatWeight(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return '—';
    }
    return `${value.toLocaleString('en-US')} kg`;
  }


  formatYesNo(value: boolean | undefined): string {
    if (value === undefined) {
      return '—';
    }
    return value ? 'Yes' : 'No';
  }


  formatLastFreeDay(value: string | null | undefined): string {
    if (value === undefined) {
      return '—';
    }
    if (!value) {
      return 'None';
    }
    return formatShortDate(value);
  }


  get showComposer(): boolean {
    if (this.loadingDeal) {
      return false;
    }
    if (!this.isClientSession && this.step === 'client') {
      return true;
    }
    return this.writingOther && !this.isTyping && this.step !== 'review' && this.step !== 'created';
  }


  get verifiedDeals(): number {
    return this.kpis.verified_commitments_count;
  }


  get activeFreightDeals(): number {
    return this.kpis.total_active_operations;
  }


  get aiEfficiency(): number {
    return Math.round(this.kpis.autonomous_resolution_rate || this.kpis.mandate_compliance_rate);
  }


  get efficiencyDashOffset(): number {
    return 97.4 * (1 - Math.min(100, Math.max(0, this.aiEfficiency)) / 100);
  }


  get contextTags(): ContextTag[] {
    const source = this.createdOperation ?? this.operation;
    const skipped = (step: Step) => this.isSkipped(step);
    return [
      {
        key: 'origin',
        label: 'Origin',
        value: source.origin || (skipped('origin') ? '—' : ''),
      },
      {
        key: 'destination',
        label: 'Destination',
        value: source.destination || (skipped('destination') ? '—' : ''),
      },
      {
        key: 'cargo',
        label: 'Cargo',
        value: source.cargo_category
          ? this.formatCargo(source.cargo_category)
          : (skipped('cargo_category') ? '—' : ''),
      },
      {
        key: 'weight',
        label: 'Weight',
        value: source.weight_kg
          ? this.formatWeight(source.weight_kg)
          : (skipped('weight') ? '—' : ''),
      },
      {
        key: 'rate',
        label: 'Target rate',
        value: source.mandate_max_price
          ? this.formatMoney(source.mandate_max_price, source.currency)
          : '',
      },
    ];
  }


  get composerChips(): ComposerChip[] {
    if (this.writingOther || this.isTyping || this.step === 'client') {
      return [];
    }
    switch (this.step) {
      case 'currency':
        return this.suggestionChips(
          this.currencySuggestions,
          (value) => this.chooseCurrency(value),
          { MXN: '🇲🇽', USD: '🇺🇸', COP: '🇨🇴' },
        );
      case 'origin':
        return this.suggestionChips(this.originSuggestions, (value) => this.chooseOrigin(value));
      case 'destination':
        return this.suggestionChips(this.destinationSuggestions, (value) => this.chooseDestination(value));
      case 'cargo_category':
        return [
          ...this.cargoSuggestions.map((option) => ({
            label: option.label,
            mark: option.value === 'food' ? '🥬' : option.value === 'electronics' ? '🔌' : '📦',
            run: () => this.chooseCargoCategory(option.value),
          })),
          this.otherChip(),
        ];
      case 'hazmat':
        return [
          { label: 'Yes', mark: '⚠️', run: () => this.chooseHazmat(true) },
          { label: 'No', mark: '✓', run: () => this.chooseHazmat(false) },
        ];
      case 'container_size':
        return [
          ...this.containerSizeSuggestions.map((option) => ({
            label: option.label,
            mark: '📦',
            run: () => this.chooseContainerSize(option.value),
          })),
          this.skipChip(),
          this.otherChip(),
        ];
      case 'container_type':
        return [
          ...this.containerTypeSuggestions.map((option) => ({
            label: option.label,
            mark: option.value === 'reefer' ? '❄️' : '📦',
            run: () => this.chooseContainerType(option.value),
          })),
          this.skipChip(),
          this.otherChip(),
        ];
      case 'weight':
        return [
          ...this.weightSuggestions.map((option) => ({
            label: option.label,
            mark: '⚖️',
            run: () => this.chooseWeight(option.value),
          })),
          this.skipChip(),
          this.otherChip(),
        ];
      case 'chassis':
        return [
          { label: 'Yes', mark: '🚛', run: () => this.chooseChassis(true) },
          { label: 'No', mark: '✓', run: () => this.chooseChassis(false) },
          this.skipChip(),
        ];
      case 'date':
        return [
          ...this.dateChips.map((chip) => ({
            label: chip.label,
            run: () => this.chooseDateOffset(chip.days),
          })),
          this.otherChip(),
        ];
      case 'pickup_window':
        return [
          ...this.pickupWindowSuggestions.map((option) => ({
            label: option.label,
            run: () => this.choosePickupWindow(option.value),
          })),
          this.skipChip(),
          this.otherChip(),
        ];
      case 'last_free_day':
        return [
          ...this.lastFreeDayChips.map((chip) => ({
            label: chip.label,
            run: () => this.chooseLastFreeDay(chip.date),
          })),
          { label: 'None', run: () => this.chooseLastFreeDayNone() },
          this.otherChip(),
        ];
      case 'price':
        return [
          ...this.priceSuggestions.map((option) => ({
            label: this.formatMoney(option),
            run: () => this.choosePrice(option),
          })),
          this.otherChip(),
        ];
      default:
        return [];
    }
  }


  private suggestionChips(
    options: string[],
    run: (value: string) => void,
    marks: Record<string, string> = {},
  ): ComposerChip[] {
    return [
      ...options.map((option) => ({
        label: option,
        mark: marks[option],
        run: () => run(option),
      })),
      this.otherChip(),
    ];
  }


  private skipChip(): ComposerChip {
    return {
      label: 'Not sure',
      run: () => this.skipCurrent(),
    };
  }


  private otherChip(): ComposerChip {
    return {
      label: this.otherChoice,
      run: () => this.chooseOther(),
    };
  }


  private loadWorkspace(): void {
    const clientId = this.isClientSession ? this.auth.clientId() || undefined : undefined;
    this.api
      .getAnalyticsKpis(clientId)
      .pipe(
        catchError(() => of(emptyAnalyticsKpis())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (kpis) => {
          this.kpis = kpis;
          this.cdr.detectChanges();
        },
      });
  }

}