import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminService } from '../../../core/services/admin';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-users.html',
  styles: ``,
})
export class AdminUsers implements OnInit {
  users: any[] = [];
  total = 0;
  loading = true;
  error = ''; success = '';

  search = ''; status = ''; stage = '';
  page = 1; limit = 20;

  selectedUser: any = null;
  creditAmount = 0; creditNote = '';

  deactivatingId: string | null = null;
  deactivateReason = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.adminService.getUsers({ search: this.search || undefined, status: this.status || undefined, stage: this.stage || undefined, page: this.page, limit: this.limit }).subscribe({
      next: res => { this.loading = false; if (res.success) { this.users = res.data || []; this.total = res.pagination?.total || 0; } },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  activateUser(id: string): void {
    this.adminService.activateUser(id, 'Admin activated').subscribe({
      next: res => { if (res.success) { this.success = 'User activated'; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }

  startDeactivate(id: string): void { this.deactivatingId = id; this.deactivateReason = ''; }
  cancelDeactivate(): void { this.deactivatingId = null; }

  submitDeactivate(): void {
    const id = this.deactivatingId!;
    this.deactivatingId = null;
    this.adminService.deactivateUser(id, this.deactivateReason || 'Admin action').subscribe({
      next: res => { if (res.success) { this.success = 'User deactivated'; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }

  creditWallet(): void {
    if (!this.selectedUser || !this.creditAmount) return;
    this.adminService.creditWallet(this.selectedUser.id, this.creditAmount, this.creditNote).subscribe({
      next: res => { if (res.success) { this.success = res.message || 'Credited!'; this.selectedUser = null; this.load(); } },
      error: err => { this.error = err.message; }
    });
  }

  totalPages(): number { return Math.ceil(this.total / this.limit); }
}
