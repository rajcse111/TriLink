import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminService } from '../../../core/services/admin';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-dashboard.html',
  styles: ``,
})
export class AdminDashboard implements OnInit {
  overview: any = null;
  loading = true;
  error = '';
  batching = false;
  batchResult = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.adminService.getReports('overview').subscribe({
      next: res => { this.loading = false; if (res.success) this.overview = res.data; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  triggerBatch(): void {
    if (!confirm('Run daily batch process now?')) return;
    this.batching = true; this.batchResult = '';
    this.adminService.triggerBatch().subscribe({
      next: res => { this.batching = false; this.batchResult = res.message || 'Batch completed!'; },
      error: err => { this.batching = false; this.batchResult = 'Error: ' + err.message; }
    });
  }
}

