import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { IncomeService } from '../../../core/services/income';

@Component({
  selector: 'app-income',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './income.html',
  styles: ``,
})
export class Income implements OnInit {
  overview: any = null;
  levelSummary: any[] = [];
  dailyIncome: any[] = [];
  history: any[] = [];
  loading = true;
  error = '';

  constructor(private incomeService: IncomeService) {}

  ngOnInit(): void {
    forkJoin({
      overview:     this.incomeService.getOverview(),
      levelSummary: this.incomeService.getLevelSummary(),
      dailyIncome:  this.incomeService.getDailyIncome(),
      history:      this.incomeService.getHistory(),
    }).subscribe({
      next: ({ overview, levelSummary, dailyIncome, history }) => {
        this.loading = false;
        if (overview.success)     this.overview     = overview.data;
        if (levelSummary.success) this.levelSummary = levelSummary.data || [];
        if (dailyIncome.success)  this.dailyIncome  = dailyIncome.data  || [];
        if (history.success)      this.history      = history.data      || [];
      },
      error: err => { this.loading = false; this.error = err.message; }
    });
  }
}
