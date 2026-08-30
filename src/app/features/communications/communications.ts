import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideDynamicIcon, LucideSearch } from '@lucide/angular';

import { AuthService } from '../../core/auth/auth.service';
import { Call } from '../../core/models/call';
import {
  parseTranscript,
  TranscriptTurn,
  VoiceCallDetail,
} from '../../core/models/voice-call';
import { LogisticsApi } from '../../core/services/logistics.api';
import { formatDuration, formatMoney } from '../../core/utils/format';

@Component({
  selector: 'app-communications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './communications.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' },
  imports: [DatePipe, LucideDynamicIcon],
})
export class Communications implements OnInit {
  private readonly api = inject(LogisticsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly icons = { search: LucideSearch };
  protected readonly calls = signal<Call[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly expandedCallId = signal<string | null>(null);
  protected readonly detail = signal<VoiceCallDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);

  protected readonly transcript = computed<TranscriptTurn[]>(() =>
    parseTranscript(this.detail()?.transcript)
  );

  protected readonly visible = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const rows = this.calls();
    if (!needle) {
      return rows;
    }
    return rows.filter((call) =>
      [
        call.call_id,
        call.summary ?? '',
        call.contact_name ?? '',
        call.contact_phone ?? '',
        call.to_number ?? '',
        call.status ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  });

  ngOnInit(): void {
    this.loadCalls();
  }

  protected loadCalls(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .listCalls(this.auth.clientId() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.calls.set(Array.isArray(rows) ? rows : []);
          this.loading.set(false);
        },
        error: () => {
          this.calls.set([]);
          this.loadError.set('Could not load communications.');
          this.loading.set(false);
        },
      });
  }

  protected openDetail(call: Call): void {
    if (call.call_id) {
      void this.router.navigate(['call', call.call_id], { relativeTo: this.route });
    }
  }

  protected toggleCall(call: Call): void {
    const callId = call.call_id;
    if (!callId) {
      return;
    }
    if (this.expandedCallId() === callId) {
      this.expandedCallId.set(null);
      return;
    }
    this.expandedCallId.set(callId);
    this.detail.set(null);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.api
      .getVoiceCall(callId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (this.expandedCallId() === callId) {
            this.detail.set(data);
            this.detailLoading.set(false);
          }
        },
        error: () => {
          if (this.expandedCallId() === callId) {
            this.detailError.set('Could not load the call detail.');
            this.detailLoading.set(false);
          }
        },
      });
  }

  protected onSearch(event: Event): void {
    const field = event.target;
    if (field instanceof HTMLInputElement) {
      this.query.set(field.value);
    }
  }

  protected durationLabel(detail: VoiceCallDetail | null): string {
    const ms = Number(detail?.duration_ms ?? NaN);
    return Number.isFinite(ms) ? formatDuration(Math.round(ms / 1000)) : '—';
  }

  protected quotedLabel(detail: VoiceCallDetail | null): string {
    const custom = detail?.call_analysis?.custom_analysis_data;
    const price = Number(custom?.quoted_price ?? NaN);
    if (!Number.isFinite(price)) {
      return '—';
    }
    return formatMoney(price, custom?.quoted_currency || 'MXN');
  }
}
