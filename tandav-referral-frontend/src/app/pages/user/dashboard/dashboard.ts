import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../../core/services/user';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dashboard.html',
  styles: ``,
})
export class Dashboard implements OnInit {
  data: any = null;
  loading = true;
  error = '';
  copied = signal(false);

  constructor(private userService: UserService, public auth: AuthService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.userService.getDashboard().subscribe({
      next: res => {
        this.loading = false;
        if (res.success) this.data = res.data;
        else this.error = res.message || 'Failed to load dashboard';
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  copyCode(code: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code)
        .then(() => this.showCopied())
        .catch(() => this.fallbackCopy(code));
    } else {
      this.fallbackCopy(code);
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this.showCopied();
  }

  private showCopied(): void {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  get stageProgress(): number {
    if (!this.data?.stageProgress) return 0;
    const { current, required } = this.data.stageProgress;
    return required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 100;
  }
}
