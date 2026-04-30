import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TitleCasePipe, MatIconModule, MatButtonModule],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  sidebarOpen = signal(true);

  navItems = [
    { label: 'Dashboard',   icon: 'dashboard',      route: '/admin/dashboard' },
    { label: 'Users',       icon: 'people',          route: '/admin/users' },
    { label: 'KYC',         icon: 'verified_user',   route: '/admin/kyc' },
    { label: 'Withdrawals', icon: 'payments',        route: '/admin/withdrawals' },
    { label: 'Meetings',    icon: 'event',           route: '/admin/meetings' },
    { label: 'Complaints',  icon: 'support_agent',   route: '/admin/complaints' },
    { label: 'Reports',     icon: 'bar_chart',       route: '/admin/reports' },
  ];

  constructor(public auth: AuthService) {}

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
}

