import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminService } from '../../../core/services/admin';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './admin-reports.html',
  styles: ``,
})
export class AdminReports implements OnInit {
  userGrowth: any[] = [];
  revenue: any[] = [];
  stageCompletion: any[] = [];
  loading = true;
  error = '';

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    forkJoin({
      ug: this.adminService.getReports('user_growth'),
      rv: this.adminService.getReports('revenue'),
      sc: this.adminService.getReports('stage_completion'),
    }).subscribe({
      next: ({ ug, rv, sc }) => {
        this.loading = false;
        if (ug?.success) this.userGrowth      = ug.data  || [];
        if (rv?.success) this.revenue         = rv.data  || [];
        if (sc?.success) this.stageCompletion = sc.data  || [];
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }
}
