import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Supabase } from './services/supabase';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly title = signal('proxibin-frontend');
  constructor(private supabaseService: Supabase) {}
  async ngOnInit() {
    const client = this.supabaseService.getClient();
    const tables = ['residents', 'haulers', 'sections', 'truck_positions', 'tickets', 'service_area'];
    for (const table of tables) {
      const { data, error } = await client.from(table).select('*').limit(1);
      if (error) {
        console.log(`Table "${table}" - error:`, error.message);
      } else {
        console.log(`Table "${table}" - found:`, data?.length ?? 0);
      }
    }
  }
}
