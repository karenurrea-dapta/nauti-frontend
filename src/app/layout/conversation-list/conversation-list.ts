import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { Operation } from '../../core/models/operation';
import { DealsRefresh } from '../../core/services/deals-refresh';
import { LogisticsApi } from '../../core/services/logistics.api';
import { formatMoney, formatShortDate } from '../../core/utils/format';

export interface ConversationCard {
  id: string;
  route: string;
  stateLabel: string;
  detail: string;
  progressCurrent: number;
  progressTotal: number;
  progressPct: number;
  tone: 'live' | 'done' | 'warn' | 'idle';
}

@Component({
  selector: 'app-conversation-list',
  templateUrl: './conversation-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class ConversationList implements OnInit {
  private readonly api = inject(LogisticsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dealsRefresh = inject(DealsRefresh);

  constructor() {
    // Reload when the assistant registers a new operation.
    effect(() => {
      this.dealsRefresh.version();
      this.loadDeals();
    });
  }

  protected readonly cards = signal<ConversationCard[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');

  ngOnInit(): void {
    this.syncSelected();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncSelected());
  }

  private loadDeals(): void {
    const clientId = this.auth.clientId() || undefined;
    this.api
      .listOperations(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (operations) => {
          this.cards.set(this.toCards(operations));
          this.loadError.set('');
          this.loading.set(false);
        },
        error: () => {
          this.cards.set([]);
          this.loadError.set('Could not load deals.');
          this.loading.set(false);
        },
      });
  }

  protected isSelected(id: string): boolean {
    return this.selectedId() === id;
  }

  private syncSelected(): void {
    const deal = this.router.parseUrl(this.router.url).queryParams['deal'];
    this.selectedId.set(typeof deal === 'string' && deal ? deal : null);
  }

  private toCards(operations: Operation[]): ConversationCard[] {
    return [...operations]
      .sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))
      .map((operation) => {
        const stage = cardStage(operation);
        return {
          id: operation.id,
          route: laneLabel(operation.origin, operation.destination),
          stateLabel: stage.label,
          detail: cardDetail(operation),
          progressCurrent: stage.current,
          progressTotal: stage.total,
          progressPct: Math.round((stage.current / stage.total) * 100),
          tone: stage.tone,
        };
      });
  }
}

function laneLabel(origin: string, destination: string): string {
  const from = shortPlace(origin);
  const to = shortPlace(destination);
  if (!from && !to) {
    return 'New commitment';
  }
  if (!from || !to) {
    return from || to;
  }
  return `${from} → ${to}`;
}

function shortPlace(value: string): string {
  const key = (value ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    guadalajara: 'GDL',
    gdl: 'GDL',
    'mexico city': 'CDMX',
    'ciudad de mexico': 'CDMX',
    'ciudad de méxico': 'CDMX',
    monterrey: 'MTY',
  };
  return aliases[key] || (value ?? '').trim();
}

function cardStage(operation: Operation): {
  label: string;
  current: number;
  total: number;
  tone: ConversationCard['tone'];
} {
  const total = 5;
  switch ((operation.status ?? '').toLowerCase()) {
    case 'quoting':
      return { label: 'Active negotiation', current: 3, total, tone: 'live' };
    case 'committed':
      return { label: 'Committed', current: 5, total, tone: 'done' };
    case 'delayed':
      return { label: 'Delayed', current: 3, total, tone: 'warn' };
    case 'escalated':
      return { label: 'Needs review', current: 4, total, tone: 'warn' };
    default:
      return { label: 'In progress', current: 2, total, tone: 'idle' };
  }
}

function cardDetail(operation: Operation): string {
  const price = formatMoney(operation.mandate_max_price, operation.currency || 'MXN');
  const pickup = formatShortDate(operation.mandate_target_date);
  const cargo = cargoLabel(operation.cargo_category);
  const parts = [price];
  if (pickup !== '—') {
    parts.push(`Pickup ${pickup}`);
  }
  if (cargo) {
    parts.push(cargo);
  }
  return parts.join(' · ');
}

function cargoLabel(value: string | undefined): string {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) {
    return '';
  }
  const labels: Record<string, string> = {
    general: 'General',
    electronics: 'Electronics',
    food: 'Food',
  };
  return labels[key] || value!.trim();
}
