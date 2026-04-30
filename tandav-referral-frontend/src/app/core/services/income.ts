import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class IncomeService {
  constructor(private api: ApiService) {}

  getOverview(start_date?: string, end_date?: string): Observable<ApiResponse> {
    return this.api.get('/income/overview', { start_date, end_date });
  }

  getLevelSummary(): Observable<ApiResponse> {
    return this.api.get('/income/level');
  }

  getDailyIncome(page = 1, limit = 30): Observable<ApiResponse> {
    return this.api.get('/income/daily', { page, limit });
  }

  getHistory(page = 1, limit = 20, type?: string): Observable<ApiResponse> {
    return this.api.get('/income/history', { page, limit, type });
  }
}
