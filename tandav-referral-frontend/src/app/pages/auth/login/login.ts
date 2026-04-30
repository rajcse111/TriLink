import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatTabsModule, MatProgressSpinnerModule, MatIconModule
  ],
  templateUrl: './login.html',
  styles: ``,
})
export class Login implements OnDestroy {
  // Password login
  identifier = '';
  password = '';
  showPassword = false;

  // OTP login
  mobile = '';
  otp = '';
  otpSent = false;
  otpTimer = 0;
  private timerRef: ReturnType<typeof setInterval> | null = null;

  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    if (this.timerRef) clearInterval(this.timerRef);
  }

  loginWithPassword(): void {
    if (!this.identifier || !this.password) { this.error = 'Please fill all fields'; return; }
    this.loading = true; this.error = '';
    this.auth.login(this.identifier, this.password).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) this.router.navigate(['/dashboard']);
        else this.error = res.message || 'Login failed';
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  sendOTP(): void {
    if (!this.mobile || this.mobile.length < 10) { this.error = 'Enter a valid mobile number'; return; }
    this.loading = true; this.error = '';
    this.auth.sendOTP(this.mobile).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) { this.otpSent = true; this.startTimer(); }
        else this.error = res.message || 'Failed to send OTP';
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  verifyOTP(): void {
    if (!this.otp) { this.error = 'Enter OTP'; return; }
    this.loading = true; this.error = '';
    this.auth.verifyOTP(this.mobile, this.otp).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) this.router.navigate(['/dashboard']);
        else this.error = res.message || 'Invalid OTP';
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  private startTimer(): void {
    if (this.timerRef) clearInterval(this.timerRef);
    this.otpTimer = 60;
    this.timerRef = setInterval(() => {
      this.otpTimer--;
      if (this.otpTimer <= 0) {
        clearInterval(this.timerRef!);
        this.timerRef = null;
      }
    }, 1000);
  }

  clearError(): void { this.error = ''; }
}
