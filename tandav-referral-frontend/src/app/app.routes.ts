import { Routes } from '@angular/router';
import { authGuard }  from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';

export const routes: Routes = [
  // Default redirect
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // Auth
  { path: 'login',    loadComponent: () => import('./pages/auth/login/login').then(m => m.Login) },
  { path: 'register', loadComponent: () => import('./pages/auth/register/register').then(m => m.Register) },

  // User portal — wrapped in Layout
  {
    path: '',
    loadComponent: () => import('./shared/layout/layout').then(m => m.Layout),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard',   loadComponent: () => import('./pages/user/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'profile',     loadComponent: () => import('./pages/user/profile/profile').then(m => m.Profile) },
      { path: 'kyc',         loadComponent: () => import('./pages/user/kyc/kyc').then(m => m.Kyc) },
      { path: 'bank-details',loadComponent: () => import('./pages/user/bank-details/bank-details').then(m => m.BankDetails) },
      { path: 'wallet',      loadComponent: () => import('./pages/user/wallet/wallet').then(m => m.Wallet) },
      { path: 'income',      loadComponent: () => import('./pages/user/income/income').then(m => m.Income) },
      { path: 'genealogy',   loadComponent: () => import('./pages/user/genealogy/genealogy').then(m => m.Genealogy) },
      { path: 'meetings',    loadComponent: () => import('./pages/user/meetings/meetings').then(m => m.Meetings) },
      { path: 'complaints',  loadComponent: () => import('./pages/user/complaints/complaints').then(m => m.Complaints) },
    ],
  },

  // Admin portal
  { path: 'admin/login', loadComponent: () => import('./pages/admin/admin-login/admin-login').then(m => m.AdminLogin) },
  {
    path: 'admin',
    loadComponent: () => import('./shared/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',   loadComponent: () => import('./pages/admin/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard) },
      { path: 'users',       loadComponent: () => import('./pages/admin/admin-users/admin-users').then(m => m.AdminUsers) },
      { path: 'kyc',         loadComponent: () => import('./pages/admin/admin-kyc/admin-kyc').then(m => m.AdminKyc) },
      { path: 'withdrawals', loadComponent: () => import('./pages/admin/admin-withdrawals/admin-withdrawals').then(m => m.AdminWithdrawals) },
      { path: 'meetings',    loadComponent: () => import('./pages/admin/admin-meetings/admin-meetings').then(m => m.AdminMeetings) },
      { path: 'complaints',  loadComponent: () => import('./pages/admin/admin-complaints/admin-complaints').then(m => m.AdminComplaints) },
      { path: 'reports',     loadComponent: () => import('./pages/admin/admin-reports/admin-reports').then(m => m.AdminReports) },
    ],
  },

  // Fallback
  { path: '**', redirectTo: '/login' },
];
