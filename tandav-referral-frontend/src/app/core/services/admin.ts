import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private api: ApiService) {}

  // Users
  getUsers(params?: any): Observable<ApiResponse> {
    return this.api.get('/admin/users', params);
  }

  getUserDetail(id: string): Observable<ApiResponse> {
    return this.api.get(`/admin/users/${id}`);
  }

  activateUser(id: string, note?: string): Observable<ApiResponse> {
    return this.api.post(`/admin/users/${id}/activate`, { note });
  }

  deactivateUser(id: string, reason?: string): Observable<ApiResponse> {
    return this.api.post(`/admin/users/${id}/deactivate`, { reason });
  }

  creditWallet(id: string, amount: number, note: string): Observable<ApiResponse> {
    return this.api.post(`/admin/users/${id}/credit`, { amount, note });
  }

  // KYC
  getPendingKYC(): Observable<ApiResponse> {
    return this.api.get('/admin/kyc/pending');
  }

  verifyKYC(id: string, action: 'approve' | 'reject', reason?: string): Observable<ApiResponse> {
    return this.api.post(`/admin/kyc/${id}/verify`, { action, reason });
  }

  // Withdrawals
  getPendingWithdrawals(page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/admin/withdrawals/pending', { page, limit });
  }

  processWithdrawal(id: string, action: 'approve' | 'reject', note?: string): Observable<ApiResponse> {
    return this.api.post(`/admin/withdrawals/${id}/process`, { action, note });
  }

  // Meetings
  createMeeting(data: any): Observable<ApiResponse> {
    return this.api.post('/admin/meetings', data);
  }

  updateMeeting(id: string, data: any): Observable<ApiResponse> {
    return this.api.put(`/admin/meetings/${id}`, data);
  }

  deleteMeeting(id: string): Observable<ApiResponse> {
    return this.api.delete(`/admin/meetings/${id}`);
  }

  // Complaints
  getComplaints(status = 'open', page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/admin/complaints', { status, page, limit });
  }

  respondToComplaint(id: string, response: string, status = 'resolved'): Observable<ApiResponse> {
    return this.api.post(`/admin/complaints/${id}/respond`, { response, status });
  }

  // Reports
  getReports(type = 'overview'): Observable<ApiResponse> {
    return this.api.get('/admin/reports', { type });
  }

  // Batch
  triggerBatch(): Observable<ApiResponse> {
    return this.api.post('/admin/batch/trigger');
  }

  getBatchLogs(): Observable<ApiResponse> {
    return this.api.get('/admin/batch/logs');
  }
}
