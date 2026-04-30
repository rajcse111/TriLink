import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../core/services/auth';
import { NotificationService } from '../../core/services/notification';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive, RouterOutlet,
    MatIconModule, MatButtonModule, MatBadgeModule
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  sidebarOpen = signal(true);
  unreadCount = signal(0);

  navItems: NavItem[] = [
    { label: 'Dashboard',   icon: 'dashboard',        route: '/dashboard' },
    { label: 'Profile',     icon: 'person',            route: '/profile' },
    { label: 'KYC',         icon: 'verified_user',     route: '/kyc' },
    { label: 'Bank Details',icon: 'account_balance',   route: '/bank-details' },
    { label: 'Wallet',      icon: 'account_balance_wallet', route: '/wallet' },
    { label: 'Income',      icon: 'trending_up',       route: '/income' },
    { label: 'My Network',  icon: 'hub',               route: '/genealogy' },
    { label: 'Meetings',    icon: 'event',             route: '/meetings' },
    { label: 'Complaints',  icon: 'support_agent',     route: '/complaints' },
  ];

  constructor(public auth: AuthService, private notifService: NotificationService) {
    this.loadUnreadCount();
  }

  private loadUnreadCount(): void {
    this.notifService.getUnreadCount().subscribe({
      next: res => { if (res.success) this.unreadCount.set(res.data?.unread || 0); },
      error: () => {}
    });
  }

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }

  logout(): void { this.auth.logout(); }
}
