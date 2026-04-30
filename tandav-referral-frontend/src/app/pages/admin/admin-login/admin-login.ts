import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './admin-login.html',
  styles: ``,
})
export class AdminLogin {
  email = ''; password = '';
  loading = false; error = '';
  showPassword = false;

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isAdminLoggedIn()) this.router.navigate(['/admin/dashboard']);
  }

  login(): void {
    if (!this.email || !this.password) { this.error = 'Enter email and password'; return; }
    this.loading = true; this.error = '';
    this.auth.adminLogin(this.email, this.password).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) this.router.navigate(['/admin/dashboard']);
        else this.error = res.message || 'Login failed';
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }
}

