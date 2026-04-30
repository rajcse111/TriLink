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
import { ApiService } from '../../../core/services/api';

@Component({
  selector: 'app-admin-meetings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-meetings.html',
  styles: ``,
})
export class AdminMeetings implements OnInit {
  meetings: any[] = [];
  loading = true;
  saving = false;
  error = ''; success = '';
  showForm = false;
  editingId: string | null = null;
  deletingId: string | null = null;

  form: any = { meeting_date: '', meeting_time: '', meeting_type: 'city', contact_person: '', mobile_no: '', email: '', venue: '', city: '', state: '', description: '' };

  constructor(private adminService: AdminService, private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.get<any[]>('/meetings').subscribe({
      next: res => { this.loading = false; if (res.success) this.meetings = (res.data as any[]) || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  save(): void {
    this.saving = true; this.error = ''; this.success = '';
    const obs = this.editingId
      ? this.adminService.updateMeeting(this.editingId, this.form)
      : this.adminService.createMeeting(this.form);
    obs.subscribe({
      next: res => {
        this.saving = false;
        if (res.success) { this.success = res.message || 'Saved!'; this.showForm = false; this.editingId = null; this.resetForm(); this.load(); }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.saving = false; this.error = err.message; }
    });
  }

  edit(m: any): void {
    this.editingId = m.id;
    this.form = { ...m };
    this.showForm = true;
  }

  confirmDelete(id: string): void { this.deletingId = id; }
  cancelDelete(): void { this.deletingId = null; }

  delete(id: string): void {
    this.deletingId = null;
    this.adminService.deleteMeeting(id).subscribe({
      next: res => { if (res.success) this.load(); },
      error: err => { this.error = err.message; }
    });
  }

  resetForm(): void {
    this.form = { meeting_date: '', meeting_time: '', meeting_type: 'city', contact_person: '', mobile_no: '', email: '', venue: '', city: '', state: '', description: '' };
  }
}
