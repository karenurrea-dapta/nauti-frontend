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
import { LucideDynamicIcon, LucideSearch } from '@lucide/angular';

import { Call } from '../../core/models/call';
import { LogisticsApi } from '../../core/services/logistics.api';
import { formatDuration } from '../../core/utils/format';

@Component({
  selector: 'app-logs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logs.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' },
  imports: [DatePipe, LucideDynamicIcon],
})
export class Logs implements OnInit {
  private readonly api = inject(LogisticsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = { search: LucideSearch };
  protected readonly calls = signal<Call[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const rows = this.calls();
    if (!needle) {
      return rows;
    }
    return rows.filter((call) => {
      const haystack = [
        call.id,
        call.call_id,
        call.summary ?? '',
        call.agent_id ?? '',
        call.contact_name ?? '',
        call.contact_phone ?? '',
        call.status ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  });

  ngOnInit(): void {
    this.loadCalls();
  }

  protected loadCalls(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .listCalls()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.calls.set(Array.isArray(rows) ? rows : []);
          this.loading.set(false);
        },
        error: () => {
          this.calls.set([]);
          this.loadError.set('Could not load call logs.');
          this.loading.set(false);
        },
      });
  }

  protected onSearch(event: Event): void {
    const field = event.target;
    if (field instanceof HTMLInputElement) {
      this.query.set(field.value);
    }
  }

  protected durationLabel(seconds: number | null | undefined): string {
    return formatDuration(seconds);
  }
}
