import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api';

@Component({
  selector: 'app-complaints',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './complaints.html',
  styles: ``,
})
export class Complaints implements OnInit {
  complaints: any[] = [];
  loading = true;
  submitting = false;
  error = ''; success = '';
  showForm = false;

  form = { subject: '', category: '', description: '' };

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.get<any[]>('/complaints').subscribe({
      next: res => { this.loading = false; if (res.success) this.complaints = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  submit(): void {
    if (!this.form.subject || !this.form.description) { this.error = 'Fill subject and description'; return; }
    this.submitting = true; this.error = ''; this.success = '';
    this.api.post<any>('/complaints', this.form).subscribe({
      next: res => {
        this.submitting = false;
        if (res.success) { this.success = res.message || 'Complaint submitted!'; this.form = { subject: '', category: '', description: '' }; this.showForm = false; this.load(); }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.submitting = false; this.error = err.message; }
    });
  }
}

