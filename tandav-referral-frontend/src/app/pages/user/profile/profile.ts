import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../../core/services/user';
import { AuthService } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSelectModule, MatIconModule, MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './profile.html',
  styles: ``,
})
export class Profile implements OnInit {
  profile: any = null;
  loading = true;
  saving = false;
  activating = false;
  error = ''; success = '';
  apiBase = environment.apiBase;

  editForm: any = {};
  activationPassword = '';
  newPassword = ''; currentPassword = '';
  showActivationPwd = false;

  constructor(private userService: UserService, public auth: AuthService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.userService.getProfile().subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.profile = res.data;
          this.editForm = {
            full_name: res.data.full_name, father_husband_name: res.data.father_husband_name,
            email: res.data.email, gender: res.data.gender,
            marital_status: res.data.marital_status, address: res.data.address,
            state: res.data.state, district: res.data.district
          };
        }
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  saveProfile(): void {
    this.saving = true; this.error = ''; this.success = '';
    this.userService.updateProfile(this.editForm).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) { this.success = 'Profile updated!'; this.load(); }
        else this.error = res.message || 'Update failed';
      },
      error: err => { this.saving = false; this.error = err.message; }
    });
  }

  activateAccount(): void {
    if (!this.activationPassword) { this.error = 'Enter transaction password'; return; }
    this.activating = true; this.error = ''; this.success = '';
    this.userService.activateAccount(this.activationPassword).subscribe({
      next: res => {
        this.activating = false;
        if (res.success) { this.success = res.message || 'Account activated!'; this.load(); }
        else this.error = res.message || 'Activation failed';
      },
      error: err => { this.activating = false; this.error = err.message; }
    });
  }

  changePassword(): void {
    if (!this.currentPassword || !this.newPassword) { this.error = 'Fill all fields'; return; }
    this.saving = true; this.error = ''; this.success = '';
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) { this.success = res.message || 'Password changed!'; this.currentPassword = ''; this.newPassword = ''; }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.saving = false; this.error = err.message; }
    });
  }

  onImageSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.userService.uploadProfileImage(file).subscribe({
      next: res => { if (res.success) this.load(); },
      error: err => { this.error = err.message; }
    });
  }
}

