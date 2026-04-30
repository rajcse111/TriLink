import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminService } from '../../../core/services/admin';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-kyc',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-kyc.html',
  styles: ``,
})
export class AdminKyc implements OnInit {
  kycs: any[] = [];
  loading = true;
  error = ''; success = '';
  apiBase = environment.apiBase;

  pendingRejectId: string | null = null;
  rejectReason = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.adminService.getPendingKYC().subscribe({
      next: res => { this.loading = false; if (res.success) this.kycs = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  approve(id: string): void {
    this.adminService.verifyKYC(id, 'approve').subscribe({
      next: res => { if (res.success) { this.success = 'KYC approved'; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }

  startReject(id: string): void { this.pendingRejectId = id; this.rejectReason = ''; }
  cancelReject(): void { this.pendingRejectId = null; this.rejectReason = ''; }

  submitReject(): void {
    if (!this.rejectReason.trim()) return;
    const id = this.pendingRejectId!;
    this.pendingRejectId = null;
    this.adminService.verifyKYC(id, 'reject', this.rejectReason).subscribe({
      next: res => { if (res.success) { this.success = 'KYC rejected'; this.load(); } },
      error: err => { this.error = err.message; }
    });
    this.rejectReason = '';
  }
}
