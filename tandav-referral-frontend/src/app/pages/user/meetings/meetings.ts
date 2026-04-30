import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api';

@Component({
  selector: 'app-meetings',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './meetings.html',
  styles: ``,
})
export class Meetings implements OnInit {
  meetings: any[] = [];
  loading = true;
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.get<any[]>('/meetings').subscribe({
      next: res => { this.loading = false; if (res.success) this.meetings = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }
}

