import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('trilink_admin_token');
  if (token) return true;
  return router.createUrlTree(['/admin/login']);
};
