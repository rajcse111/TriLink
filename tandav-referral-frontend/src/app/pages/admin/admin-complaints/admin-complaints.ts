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
  selector: 'app-admin-complaints',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-complaints.html',
  styles: ``,
})
export class AdminComplaints implements OnInit {
  complaints: any[] = [];
  loading = true;
  error = ''; success = '';
  status = 'open';
  responding: string | null = null;
  responseText = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.adminService.getComplaints(this.status).subscribe({
      next: res => { this.loading = false; if (res.success) this.complaints = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  respond(id: string): void {
    if (!this.responseText) { this.error = 'Enter a response'; return; }
    this.adminService.respondToComplaint(id, this.responseText).subscribe({
      next: res => {
        if (res.success) { this.success = 'Response sent'; this.responding = null; this.responseText = ''; this.load(); }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.error = err.message; }
    });
  }
}

