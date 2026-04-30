import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WalletService } from '../../../core/services/wallet';
import { UserService } from '../../../core/services/user';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule, MatIconModule, MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './wallet.html',
  styles: ``,
})
export class Wallet implements OnInit {
  balance: any = null;
  transactions: any[] = [];
  withdrawals: any[] = [];
  banks: any[] = [];

  loading = true;
  withdrawing = false;
  error = ''; success = '';

  withdrawForm = { amount: 0, bank_detail_id: '', transaction_password: '' };
  txnPage = 1; txnTotal = 0;
  wdPage = 1; wdTotal = 0;

  constructor(private walletService: WalletService, private userService: UserService) {}

  ngOnInit(): void {
    this.loadBalance();
    this.loadTransactions();
    this.loadWithdrawals();
    this.loadBanks();
  }

  loadBalance(): void {
    this.walletService.getBalance().subscribe({
      next: res => { this.loading = false; if (res.success) this.balance = res.data; },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }

  loadTransactions(): void {
    this.walletService.getTransactions(this.txnPage).subscribe({
      next: res => { if (res.success) { this.transactions = res.data || []; this.txnTotal = res.pagination?.total || 0; } },
      error: () => {}
    });
  }

  loadWithdrawals(): void {
    this.walletService.getWithdrawalHistory(this.wdPage).subscribe({
      next: res => { if (res.success) { this.withdrawals = res.data || []; this.wdTotal = res.pagination?.total || 0; } },
      error: () => {}
    });
  }

  loadBanks(): void {
    this.userService.getBankDetails().subscribe({
      next: res => { if (res.success) this.banks = res.data || []; },
      error: () => {}
    });
  }

  withdraw(): void {
    if (!this.withdrawForm.amount || this.withdrawForm.amount < 100) { this.error = 'Minimum withdrawal ₹100'; return; }
    if (!this.withdrawForm.bank_detail_id) { this.error = 'Select bank account'; return; }
    if (!this.withdrawForm.transaction_password) { this.error = 'Enter transaction password'; return; }
    this.withdrawing = true; this.error = ''; this.success = '';
    this.walletService.requestWithdrawal(this.withdrawForm).subscribe({
      next: res => {
        this.withdrawing = false;
        if (res.success) { this.success = res.message || 'Withdrawal request submitted!'; this.loadBalance(); this.loadWithdrawals(); this.withdrawForm = { amount: 0, bank_detail_id: '', transaction_password: '' }; }
        else this.error = res.message || 'Failed';
      },
      error: err => { this.withdrawing = false; this.error = err.message; }
    });
  }

  txnColor(type: string): string {
    return ['level_income', 'stage_bonus', 'admin_credit'].includes(type) ? 'success' : 'danger';
  }
}

