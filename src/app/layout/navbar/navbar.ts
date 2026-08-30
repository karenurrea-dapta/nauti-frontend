import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideHandshake,
  LucideHistory,
  LucideSparkles,
  LucideLogOut,
  LucideScrollText,
  LucideShield,
  LucideTruck,
  LucideUserRound,
  LucideUsers,
} from '@lucide/angular';

import { AuthService } from '../../core/auth/auth.service';
import { homeForRole } from '../../core/models/user';
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
  protected readonly canSwitchView = this.auth.canSwitchView;
  protected readonly viewingClient = this.auth.viewingClient;
  protected readonly icons = {
    assistant: LucideSparkles,
    negotiations: LucideHandshake,
    truck: LucideTruck,
    client: LucideUsers,
    history: LucideHistory,
    logs: LucideScrollText,
    account: LucideUserRound,
    logout: LucideLogOut,
    view: LucideShield,
  };

  protected async toggleView(): Promise<void> {
    const next = this.auth.toggleView();
    await this.router.navigateByUrl(homeForRole(next));
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
