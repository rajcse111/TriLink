import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, ApiResponse } from './api';

@Injectable({ providedIn: 'root' })
export class GenealogyService {
  constructor(private api: ApiService) {}

  getSponsor(): Observable<ApiResponse> {
    return this.api.get('/genealogy/sponsor');
  }

  getAllTeam(page = 1, limit = 20, search?: string): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/all', { page, limit, search });
  }

  getLeftTeam(): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/left');
  }

  getMiddleTeam(): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/middle');
  }

  getRightTeam(): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/right');
  }

  getActiveTeam(page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/active', { page, limit });
  }

  getInactiveTeam(page = 1, limit = 20): Observable<ApiResponse> {
    return this.api.get('/genealogy/team/inactive', { page, limit });
  }

  getTreeView(associate_id?: string, depth = 4): Observable<ApiResponse> {
    return this.api.get('/genealogy/tree', { associate_id, depth });
  }

  getLevelGenealogy(): Observable<ApiResponse> {
    return this.api.get('/genealogy/levels');
  }
}
