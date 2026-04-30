import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private api: ApiService) {}

  getDashboard(): Observable<ApiResponse> {
    return this.api.get('/user/dashboard');
  }

  getProfile(): Observable<ApiResponse> {
    return this.api.get('/user/profile');
  }

  updateProfile(data: any): Observable<ApiResponse> {
    return this.api.put('/user/profile', data);
  }

  uploadProfileImage(file: File): Observable<ApiResponse> {
    const fd = new FormData();
    fd.append('image', file);
    return this.api.postForm('/user/profile/image', fd);
  }

  getWelcomeLetter(): Observable<ApiResponse> {
    return this.api.get('/user/welcome-letter');
  }

  submitKYC(formData: FormData): Observable<ApiResponse> {
    return this.api.postForm('/user/kyc', formData);
  }

  getKYCStatus(): Observable<ApiResponse> {
    return this.api.get('/user/kyc');
  }

  getBankDetails(): Observable<ApiResponse> {
    return this.api.get('/user/bank-details');
  }

  addBankDetail(data: any): Observable<ApiResponse> {
    return this.api.post('/user/bank-details', data);
  }

  deleteBankDetail(id: string): Observable<ApiResponse> {
    return this.api.delete(`/user/bank-details/${id}`);
  }

  activateAccount(transaction_password: string): Observable<ApiResponse> {
    return this.api.post('/user/activate', { transaction_password });
  }

  changeTransactionPassword(data: any): Observable<ApiResponse> {
    return this.api.put('/user/transaction-password', data);
  }

  getStageProgress(): Observable<ApiResponse> {
    return this.api.get('/stage/progress');
  }
}
