import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon, LucideSend } from '@lucide/angular';
import { switchMap, tap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { DealsRefresh } from '../../core/services/deals-refresh';
import { NautiChatApi } from '../../core/services/nauti-chat.api';
import { assistantReplyFrom, ChatMessage, emptyMandateState, MandateState } from '../../core/models/assistant-chat';
import { readErrorDetail } from '../../core/utils/http-error';
import { formatMoney } from '../../core/utils/format';

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: "Hi, I'm Nauti. Tell me what you need to move — any cargo, by land or sea — or ask me anything about Nauta.",
};

interface ContextTag {
  key: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-assistant',
  templateUrl: './assistant.html',
  styleUrl: './assistant.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  },
  imports: [LucideDynamicIcon],
})
export class Assistant {
  private readonly api = inject(NautiChatApi);
  private readonly auth = inject(AuthService);
  private readonly dealsRefresh = inject(DealsRefresh);
  private readonly destroyRef = inject(DestroyRef);

  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composer = viewChild<ElementRef<HTMLInputElement>>('composerField');
  private sessionId: string | null = null;

  protected readonly icons = { send: LucideSend };
  protected readonly messages = signal<ChatMessage[]>([WELCOME]);
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected readonly mandate = signal<MandateState>(emptyMandateState());
  protected draft = '';

  protected readonly contextTags = computed<ContextTag[]>(() => {
    const state = this.mandate();
    const rate = state.target_rate != null ? formatMoney(state.target_rate, state.currency || 'USD') : '';
    return [
      { key: 'origin', label: 'Origin', value: state.origin ?? '' },
      { key: 'destination', label: 'Destination', value: state.destination ?? '' },
      { key: 'cargo', label: 'Cargo', value: state.cargo ?? '' },
      { key: 'weight', label: 'Weight', value: state.weight_kg != null ? `${state.weight_kg} kg` : '' },
      { key: 'rate', label: 'Target rate', value: rate },
    ];
  });

  protected onDraft(event: Event): void {
    this.draft = (event.target as HTMLInputElement).value;
  }

  protected send(): void {
    const text = this.draft.trim();
    if (!text || this.sending()) {
      return;
    }
    this.draft = '';
    this.error.set('');
    this.sending.set(true);
    this.append({ id: `user-${Date.now()}`, role: 'user', text });

    const context = this.clientContext();
    const withSession = this.sessionId
      ? this.api.sendMessage(this.sessionId, text, context)
      : this.api.createSession(`portal-${this.auth.email() || 'anon'}`).pipe(
          tap((session) => (this.sessionId = session.id)),
          switchMap((session) => this.api.sendMessage(session.id, text, context)),
        );

    withSession.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const reply = assistantReplyFrom(response);
        if (reply.text) {
          this.append({ id: response.info.id, role: 'assistant', text: reply.text });
        }
        if (reply.state) {
          this.mandate.set(reply.state);
        }
        this.sending.set(false);
        this.scrollToEnd();
        this.focusComposer();
        this.dealsRefresh.refresh();
      },
      error: (err) => {
        this.error.set(readErrorDetail(err, 'Could not reach the assistant. Please try again.'));
        this.sending.set(false);
        this.focusComposer();
      },
    });
  }

  private clientContext(): string | undefined {
    const clientId = this.auth.clientId();
    if (!clientId) {
      return undefined;
    }
    const email = this.auth.email() || 'unknown';
    return `Client context: client_id=${clientId}, email=${email}`;
  }

  private append(message: ChatMessage): void {
    this.messages.update((all) => [...all, message]);
    this.scrollToEnd();
  }

  private scrollToEnd(): void {
    requestAnimationFrame(() => {
      const el = this.thread()?.nativeElement;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }

  private focusComposer(): void {
    requestAnimationFrame(() => this.composer()?.nativeElement.focus());
  }
}
