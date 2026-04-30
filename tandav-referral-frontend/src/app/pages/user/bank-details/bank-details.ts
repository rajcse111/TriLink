import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../../core/services/user';

@Component({
  selector: 'app-bank-details',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './bank-details.html',
  styles: ``,
})
export class BankDetails implements OnInit {
  banks: any[] = [];
  loading = true;
  saving = false;
  error = ''; success = '';
  showForm = false;
  deletingId: string | null = null;

  form = { account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '', branch_name: '', is_primary: false };

  constructor(private userService: UserService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.userService.getBankDetails().subscribe({
      next: res => { this.loading = false; if (res.success) this.banks = res.data || []; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  add(): void {
    if (!this.form.account_holder_name || !this.form.account_number || !this.form.ifsc_code || !this.form.bank_name) {
      this.error = 'Fill all required fields'; return;
    }
    this.saving = true; this.error = ''; this.success = '';
    this.userService.addBankDetail(this.form).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) { this.success = 'Bank details added!'; this.showForm = false; this.form = { account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '', branch_name: '', is_primary: false }; this.load(); }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.saving = false; this.error = err.message; }
    });
  }

  confirmDelete(id: string): void { this.deletingId = id; }
  cancelDelete(): void { this.deletingId = null; }

  delete(id: string): void {
    this.deletingId = null;
    this.userService.deleteBankDetail(id).subscribe({
      next: res => { if (res.success) this.load(); },
      error: err => { this.error = err.message; }
    });
  }
}
