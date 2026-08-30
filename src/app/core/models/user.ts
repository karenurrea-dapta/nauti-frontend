import { Client } from './client';

export type UserRole = 'super_admin' | 'client';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  client_id: string;
  created_at: string;
  client?: Client | null;
}

export interface BootstrapUserRequest {
  uid: string;
  email: string;
  name?: string;
  contact_name?: string;
  contact_phone?: string;
}

export function homeForRole(role: UserRole | null | undefined): string {
  return role === 'super_admin' ? '/carriers' : '/portal/assistant';
}
