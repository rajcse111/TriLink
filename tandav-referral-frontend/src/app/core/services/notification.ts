import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private api: ApiService) {}

  getNotifications(page = 1, unread = false): Observable<ApiResponse> {
    return this.api.get('/notifications', { page, unread });
  }

  getUnreadCount(): Observable<ApiResponse> {
    return this.api.get('/notifications/count');
  }

  markRead(id?: string): Observable<ApiResponse> {
    return this.api.post('/notifications/read', { id });
  }
}
