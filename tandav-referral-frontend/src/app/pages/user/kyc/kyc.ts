import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../../core/services/user';

@Component({
  selector: 'app-kyc',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './kyc.html',
  styles: ``,
})
export class Kyc implements OnInit {
  kycList: any[] = [];
  loading = true;
  submitting = false;
  error = ''; success = '';

  form = { document_type: '', document_number: '' };
  frontFile: File | null = null;
  backFile: File | null = null;

  constructor(private userService: UserService) {}

  ngOnInit(): void { this.loadKYC(); }

  loadKYC(): void {
    this.loading = true;
    this.userService.getKYCStatus().subscribe({
      next: res => { this.loading = false; if (res.success) this.kycList = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  onFrontFile(e: Event): void { this.frontFile = (e.target as HTMLInputElement).files?.[0] || null; }
  onBackFile(e: Event): void  { this.backFile  = (e.target as HTMLInputElement).files?.[0] || null; }

  submit(): void {
    if (!this.form.document_type) { this.error = 'Select document type'; return; }
    const fd = new FormData();
    fd.append('document_type',   this.form.document_type);
    fd.append('document_number', this.form.document_number);
    if (this.frontFile) fd.append('front_image', this.frontFile);
    if (this.backFile)  fd.append('back_image',  this.backFile);

    this.submitting = true; this.error = ''; this.success = '';
    this.userService.submitKYC(fd).subscribe({
      next: res => {
        this.submitting = false;
        if (res.success) { this.success = res.message || 'KYC submitted!'; this.form = { document_type: '', document_number: '' }; this.frontFile = null; this.backFile = null; this.loadKYC(); }
        else this.error = res.message || 'Submission failed';
      },
      error: err => { this.submitting = false; this.error = err.message; }
    });
  }
}

