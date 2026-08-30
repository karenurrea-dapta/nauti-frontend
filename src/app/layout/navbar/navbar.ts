import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideHandshake,
  LucideHistory,
  LucideSparkles,
  LucideLogOut,
  LucideMessageCircle,
  LucideRocket,
  LucideScrollText,
  LucideTruck,
  LucideUserRound,
  LucideUsers,
} from '@lucide/angular';

import { AuthService } from '../../core/auth/auth.service';
import { ConversationList } from '../conversation-list/conversation-list';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon, ThemeToggle, ConversationList],
})
export class Navbar {
  readonly variant = input<'admin' | 'client'>('admin');

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = this.auth.email;
  protected readonly icons = {
    assistant: LucideSparkles,
    command: LucideMessageCircle,
    negotiations: LucideHandshake,
    truck: LucideTruck,
    client: LucideUsers,
    history: LucideHistory,
    logs: LucideScrollText,
    rocket: LucideRocket,
    account: LucideUserRound,
    logout: LucideLogOut,
  };

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
