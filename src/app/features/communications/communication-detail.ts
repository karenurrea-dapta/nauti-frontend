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
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  parseTranscript,
  TranscriptTurn,
  VoiceCallDetail,
} from '../../core/models/voice-call';
import { LogisticsApi } from '../../core/services/logistics.api';
import { formatDuration, formatMoney } from '../../core/utils/format';

@Component({
  selector: 'app-communication-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './communication-detail.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' },
  imports: [DatePipe, RouterLink],
})
export class CommunicationDetail implements OnInit {
  private readonly api = inject(LogisticsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detail = signal<VoiceCallDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly transcript = computed<TranscriptTurn[]>(() =>
    parseTranscript(this.detail()?.transcript)
  );

  protected readonly variables = computed(() => {
    const vars = this.detail()?.dynamic_variables ?? {};
    return Object.entries(vars).map(([key, value]) => ({ key, value }));
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const callId = params.get('callId') ?? '';
      if (callId) {
        this.load(callId);
      }
    });
  }

  private load(callId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.detail.set(null);
    this.api
      .getVoiceCall(callId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.detail.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('Could not load this call.');
          this.loading.set(false);
        },
      });
  }

  protected durationLabel(): string {
    const ms = Number(this.detail()?.duration_ms ?? NaN);
    return Number.isFinite(ms) ? formatDuration(Math.round(ms / 1000)) : '—';
  }

  protected quotedLabel(): string {
    const custom = this.detail()?.call_analysis?.custom_analysis_data;
    const price = Number(custom?.quoted_price ?? NaN);
    if (!Number.isFinite(price)) {
      return '—';
    }
    return formatMoney(price, custom?.quoted_currency || 'MXN');
  }
}
