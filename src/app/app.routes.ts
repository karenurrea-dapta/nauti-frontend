import { Routes } from '@angular/router';

import { clientGuard, guestGuard, superAdminGuard } from './core/auth/auth.guards';
import { Assistant } from './features/assistant/assistant';
import { Audit } from './features/audit/audit';
import { HomeRedirect } from './features/auth/home-redirect';
import { Login } from './features/auth/login';
import { Signup } from './features/auth/signup';
import { CarriersDirectory } from './features/carriers/carriers-directory';
import { Client } from './features/client/client';
import { ClientDirectory } from './features/client/client-directory';
import { Command } from './features/command/command';
import { DeployAgent } from './features/deploy-agent/deploy-agent';
import { Logs } from './features/logs/logs';
import { PortalCalls } from './features/portal/portal-calls';
import { QuoteHistory } from './features/quote-history/quote-history';
import { AdminShell } from './layout/admin-shell/admin-shell';
import { PortalShell } from './layout/portal-shell/portal-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeRedirect },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'signup', component: Signup, canActivate: [guestGuard] },
  {
    path: '',
    component: AdminShell,
    canActivate: [superAdminGuard],
    children: [
      { path: 'assistant', component: Assistant },
      { path: 'carriers', component: CarriersDirectory },
      { path: 'command', component: Command },
      { path: 'negotiations', component: Audit },
      { path: 'logs', component: Logs },
      { path: 'client', component: ClientDirectory },
      { path: 'client/:id', component: Client },
      { path: 'quote-history', component: QuoteHistory },
      { path: 'network', redirectTo: 'client' },
      { path: 'deploy', component: DeployAgent },
    ],
  },
  {
    path: 'portal',
    component: PortalShell,
    canActivate: [clientGuard],
    children: [
      { path: '', component: Audit },
      { path: 'assistant', component: Assistant },
      { path: 'command', component: Command },
      { path: 'carriers', component: CarriersDirectory },
      { path: 'calls', component: PortalCalls },
    ],
  },
  { path: '**', component: HomeRedirect },
];
