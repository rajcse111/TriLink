import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class WalletService {
  constructor(private api: ApiService) {}

  getBalance(): Observable<ApiResponse> {
    return this.api.get('/wallet/balance');
  }

  getTransactions(page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/wallet/transactions', { page, limit });
  }

  requestWithdrawal(data: any): Observable<ApiResponse> {
    return this.api.post('/wallet/withdraw', data);
  }

  getWithdrawalHistory(page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/wallet/withdrawals', { page, limit });
  }
}
