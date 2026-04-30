import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgTemplateOutlet } from '@angular/common';
import { GenealogyService } from '../../../core/services/genealogy';

@Component({
  selector: 'app-genealogy',
  standalone: true,
  imports: [CommonModule, FormsModule, NgTemplateOutlet, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatIconModule, MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './genealogy.html',
  styles: ``,
})
export class Genealogy implements OnInit {
  sponsor: any = null;
  allTeam: any[] = [];
  leftTeam: any[] = [];
  middleTeam: any[] = [];
  rightTeam: any[] = [];
  treeData: any = null;
  levelData: any[] = [];

  loading = true;
  treeLoading = false;
  search = '';
  allTotal = 0;
  page = 1;

  constructor(private genealogyService: GenealogyService) {}

  ngOnInit(): void {
    this.loadSponsor();
    this.loadAllTeam();
    this.loadDirections();
    this.loadTree();
    this.loadLevels();
  }

  loadSponsor(): void {
    this.genealogyService.getSponsor().subscribe({
      next: res => { if (res.success) this.sponsor = res.data; }, error: () => {}
    });
  }

  loadAllTeam(): void {
    this.genealogyService.getAllTeam(this.page, 20, this.search || undefined).subscribe({
      next: res => { this.loading = false; if (res.success) { this.allTeam = res.data || []; this.allTotal = res.pagination?.total || 0; } },
      error: err => { this.loading = false; }
    });
  }

  loadDirections(): void {
    this.genealogyService.getLeftTeam().subscribe({ next: r => { if (r.success) this.leftTeam = r.data || []; }, error: () => {} });
    this.genealogyService.getMiddleTeam().subscribe({ next: r => { if (r.success) this.middleTeam = r.data || []; }, error: () => {} });
    this.genealogyService.getRightTeam().subscribe({ next: r => { if (r.success) this.rightTeam = r.data || []; }, error: () => {} });
  }

  loadTree(): void {
    this.treeLoading = true;
    this.genealogyService.getTreeView().subscribe({
      next: res => { this.treeLoading = false; if (res.success) this.treeData = res.data; }, error: () => { this.treeLoading = false; }
    });
  }

  loadLevels(): void {
    this.genealogyService.getLevelGenealogy().subscribe({
      next: res => { if (res.success) this.levelData = res.data || []; }, error: () => {}
    });
  }

  renderTreeNodes(nodes: any[]): any[] { return nodes || []; }
}

