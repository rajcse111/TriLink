import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService, ApiResponse } from './api';

export interface UserInfo {
  id: string;
  associateId: string;
  fullName: string;
  stage: number;
  isActive: boolean;
  isRetired: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'trilink_access_token';
  private readonly REFRESH_KEY = 'trilink_refresh_token';
  private readonly USER_KEY = 'trilink_user';
  private readonly ADMIN_TOKEN_KEY = 'trilink_admin_token';
  private readonly ADMIN_KEY = 'trilink_admin';

  currentUser = signal<UserInfo | null>(this.loadUser());
  currentAdmin = signal<any | null>(this.loadAdmin());

  constructor(private api: ApiService, private router: Router) {}

  // ── User Auth ──────────────────────────────────────────────────────

  login(identifier: string, password: string): Observable<ApiResponse> {
    return this.api.post('/auth/login', { identifier, password }).pipe(
      tap(res => {
        if (res.success && res.data) {
          this.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.saveUser(res.data.user);
        }
      })
    );
  }

  sendOTP(mobile: string): Observable<ApiResponse> {
    return this.api.post('/auth/otp/send', { mobile });
  }

  verifyOTP(mobile: string, otp: string): Observable<ApiResponse> {
    return this.api.post('/auth/otp/verify', { mobile, otp }).pipe(
      tap(res => {
        if (res.success && res.data) {
          this.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.saveUser(res.data.user);
        }
      })
    );
  }

  register(payload: any): Observable<ApiResponse> {
    return this.api.post('/auth/register', payload);
  }

  checkReferralCode(code: string): Observable<ApiResponse> {
    return this.api.get(`/auth/referral/${code}`);
  }

  logout(): void {
    this.api.post('/auth/logout').subscribe({ error: () => {} });
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  changePassword(current_password: string, new_password: string): Observable<ApiResponse> {
    return this.api.put('/auth/change-password', { current_password, new_password });
  }

  refreshToken(): Observable<ApiResponse> {
    const token = localStorage.getItem(this.REFRESH_KEY);
    return this.api.post('/auth/refresh', { refreshToken: token }).pipe(
      tap(res => {
        if (res.success && res.data?.accessToken) {
          localStorage.setItem(this.TOKEN_KEY, res.data.accessToken);
        }
      })
    );
  }

  // ── Admin Auth ─────────────────────────────────────────────────────

  adminLogin(email: string, password: string): Observable<ApiResponse> {
    return this.api.post('/admin/auth/login', { email, password }).pipe(
      tap(res => {
        if (res.success && res.data) {
          localStorage.setItem(this.ADMIN_TOKEN_KEY, res.data.token);
          localStorage.setItem(this.ADMIN_KEY, JSON.stringify(res.data.admin));
          this.currentAdmin.set(res.data.admin);
        }
      })
    );
  }

  adminLogout(): void {
    localStorage.removeItem(this.ADMIN_TOKEN_KEY);
    localStorage.removeItem(this.ADMIN_KEY);
    this.currentAdmin.set(null);
    this.router.navigate(['/admin/login']);
  }

  silentLogout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  silentAdminLogout(): void {
    localStorage.removeItem(this.ADMIN_TOKEN_KEY);
    localStorage.removeItem(this.ADMIN_KEY);
    this.currentAdmin.set(null);
    this.router.navigate(['/admin/login']);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  getToken(): string | null { return localStorage.getItem(this.TOKEN_KEY); }
  getAdminToken(): string | null { return localStorage.getItem(this.ADMIN_TOKEN_KEY); }
  isLoggedIn(): boolean { return !!this.getToken(); }
  isAdminLoggedIn(): boolean { return !!this.getAdminToken(); }

  private saveTokens(access: string, refresh: string): void {
    localStorage.setItem(this.TOKEN_KEY, access);
    localStorage.setItem(this.REFRESH_KEY, refresh);
  }

  private saveUser(user: UserInfo): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): UserInfo | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private loadAdmin(): any | null {
    const raw = localStorage.getItem(this.ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  updateUserSignal(user: UserInfo): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }
}
