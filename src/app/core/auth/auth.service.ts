import { computed, inject, Injectable, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { catchError, firstValueFrom } from 'rxjs';

import { firebaseAuth } from '../firebase';
import { AppUser, homeForRole, UserRole } from '../models/user';
import { LogisticsApi } from '../services/logistics.api';

const VIEW_ROLE_KEY = 'nauti.viewRole';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(LogisticsApi);

  readonly firebaseUser = signal<User | null>(null);
  readonly appUser = signal<AppUser | null>(null);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);
  private readonly viewOverride = signal<UserRole | null>(readStoredViewRole());

  readonly accountRole = computed<UserRole | null>(() => this.appUser()?.role ?? null);
  readonly role = computed<UserRole | null>(() => {
    const account = this.accountRole();
    if (account !== 'super_admin') {
      return account;
    }
    return this.viewOverride() ?? account;
  });
  readonly canSwitchView = computed(() => this.accountRole() === 'super_admin');
  readonly viewingClient = computed(() => this.role() === 'client');
  readonly clientId = computed(() => this.appUser()?.client_id ?? '');
  readonly email = computed(() => this.appUser()?.email || this.firebaseUser()?.email || '');

  private resolveReady: (() => void) | null = null;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    onAuthStateChanged(firebaseAuth, (user) => {
      void this.syncSession(user);
    });
  }

  whenReady(): Promise<void> {
    if (this.ready()) {
      return Promise.resolve();
    }
    return this.readyPromise;
  }

  homePath(): string {
    return homeForRole(this.role());
  }

  setViewRole(role: UserRole): void {
    if (this.accountRole() !== 'super_admin') {
      return;
    }
    this.viewOverride.set(role);
    sessionStorage.setItem(VIEW_ROLE_KEY, role);
  }

  toggleView(): UserRole {
    const next: UserRole = this.role() === 'client' ? 'super_admin' : 'client';
    this.setViewRole(next);
    return next;
  }

  async login(email: string, password: string): Promise<void> {
    this.error.set(null);
    const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    const profile = await this.loadProfile(cred.user);
    this.appUser.set(profile);
    if (!profile) {
      throw new Error(this.error() || 'Could not load your profile.');
    }
  }

  async signup(input: {
    email: string;
    password: string;
    name: string;
    contactName: string;
    contactPhone: string;
  }): Promise<void> {
    this.error.set(null);
    const created = await createUserWithEmailAndPassword(
      firebaseAuth,
      input.email.trim(),
      input.password,
    );
    const displayName = input.name.trim() || input.contactName.trim();
    if (displayName) {
      await updateProfile(created.user, { displayName });
    }
    const profile = await this.loadProfile(created.user, {
      name: input.name.trim(),
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone.trim(),
    });
    this.appUser.set(profile);
    if (!profile) {
      throw new Error(this.error() || 'Could not create your profile.');
    }
  }

  async logout(): Promise<void> {
    this.error.set(null);
    this.viewOverride.set(null);
    sessionStorage.removeItem(VIEW_ROLE_KEY);
    await signOut(firebaseAuth);
    this.appUser.set(null);
  }

  private async syncSession(user: User | null): Promise<void> {
    this.firebaseUser.set(user);
    if (!user) {
      this.appUser.set(null);
      this.markReady();
      return;
    }
    const profile = await this.loadProfile(user);
    this.appUser.set(profile);
    this.markReady();
  }

  private async loadProfile(
    user: User,
    extras: { name?: string; contactName?: string; contactPhone?: string } = {},
  ): Promise<AppUser | null> {
    try {
      return await firstValueFrom(
        this.api.getUser(user.uid).pipe(
          catchError((err: { status?: number }) => {
            if (err.status !== 404) {
              throw err;
            }
            return this.api.bootstrapUser({
              uid: user.uid,
              email: user.email ?? '',
              name: extras.name || user.displayName || '',
              contact_name: extras.contactName || extras.name || user.displayName || '',
              contact_phone: extras.contactPhone || '',
            });
          }),
        ),
      );
    } catch (err) {
      this.error.set(readAuthError(err));
      return null;
    }
  }

  private markReady(): void {
    this.ready.set(true);
    this.resolveReady?.();
    this.resolveReady = null;
  }
}

function readStoredViewRole(): UserRole | null {
  try {
    const raw = sessionStorage.getItem(VIEW_ROLE_KEY);
    return raw === 'client' || raw === 'super_admin' ? raw : null;
  } catch {
    return null;
  }
}

export function readAuthError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is not correct.';
    case 'auth/email-already-in-use':
      return 'That email already has an account.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email.';
    default:
      break;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Authentication failed.';
}
