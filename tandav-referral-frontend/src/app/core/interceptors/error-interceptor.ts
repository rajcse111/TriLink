import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError(err => {
      if (err.status === 401) {
        const isAdmin = req.url.includes('/admin/');
        if (isAdmin) auth.silentAdminLogout();
        else auth.silentLogout();
      }
      const message = err.error?.message || err.message || 'An error occurred';
      return throwError(() => new Error(message));
    })
  );
};
