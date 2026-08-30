import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.appUser()) {
    return router.createUrlTree([auth.homePath()]);
  }
  return true;
};

export const superAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.role() === 'super_admin') {
    return true;
  }
  if (auth.role() === 'client') {
    return router.createUrlTree(['/portal/assistant']);
  }
  return router.createUrlTree(['/login']);
};

export const clientGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.role() === 'client') {
    return true;
  }
  if (auth.role() === 'super_admin') {
    return router.createUrlTree(['/carriers']);
  }
  return router.createUrlTree(['/login']);
};
