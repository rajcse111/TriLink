import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSelectModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatIconModule, MatStepperModule
  ],
  templateUrl: './register.html',
  styles: ``,
})
export class Register {
  step = 1; // 1 = referral check, 2 = fill form

  // Step 1
  referralCode = '';
  sponsorInfo: any = null;
  availablePositions: string[] = [];
  checkingCode = false;

  // Step 2 form
  form = {
    full_name: '', father_husband_name: '', mobile: '', email: '',
    date_of_birth: '', gender: '', marital_status: '', address: '',
    state: '', district: '', password: '', transaction_password: '',
    referral_code: '', position: '', terms_accepted: false
  };

  loading = false;
  error = '';
  success = '';
  showPassword = false;

  constructor(private auth: AuthService, private router: Router) {}

  checkReferral(): void {
    if (!this.referralCode) { this.error = 'Enter referral code'; return; }
    this.checkingCode = true; this.error = '';
    this.auth.checkReferralCode(this.referralCode).subscribe({
      next: res => {
        this.checkingCode = false;
        if (res.success && res.data) {
          this.sponsorInfo = res.data.sponsor;
          this.availablePositions = res.data.availablePositions;
          this.form.referral_code = this.referralCode;
          this.step = 2;
        } else {
          this.error = res.message || 'Invalid referral code';
        }
      },
      error: err => { this.checkingCode = false; this.error = err.message; }
    });
  }

  register(): void {
    if (!this.form.terms_accepted) { this.error = 'Please accept terms & conditions'; return; }
    if (!this.form.position) { this.error = 'Please select a position'; return; }
    this.loading = true; this.error = '';
    this.auth.register(this.form).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.success = `Registration successful! Your Associate ID: ${res.data?.associateId}. Please login to continue.`;
          setTimeout(() => this.router.navigate(['/login']), 4000);
        } else {
          this.error = res.message || 'Registration failed';
        }
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }
}

