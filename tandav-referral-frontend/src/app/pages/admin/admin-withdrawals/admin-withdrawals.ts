import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminService } from '../../../core/services/admin';

@Component({
  selector: 'app-admin-withdrawals',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-withdrawals.html',
  styles: ``,
})
export class AdminWithdrawals implements OnInit {
  withdrawals: any[] = [];
  loading = true;
  error = ''; success = '';

  pendingRejectId: string | null = null;
  rejectNote = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.adminService.getPendingWithdrawals().subscribe({
      next: res => { this.loading = false; if (res.success) this.withdrawals = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  approve(id: string): void {
    this.adminService.processWithdrawal(id, 'approve').subscribe({
      next: res => { if (res.success) { this.success = 'Withdrawal approved'; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }

  startReject(id: string): void { this.pendingRejectId = id; this.rejectNote = ''; }
  cancelReject(): void { this.pendingRejectId = null; }

  submitReject(): void {
    const id = this.pendingRejectId!;
    this.pendingRejectId = null;
    this.adminService.processWithdrawal(id, 'reject', this.rejectNote).subscribe({
      next: res => { if (res.success) { this.success = 'Withdrawal rejected'; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }
}
