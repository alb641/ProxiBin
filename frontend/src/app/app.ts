import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { Supabase } from './services/supabase';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
 constructor(private supabaseService: Supabase, private router: Router) {}
 
 ngOnInit() {
  const client = this.supabaseService.getClient();
  client.auth.onAuthStateChange((event) => {
   if (event === 'SIGNED_OUT') {
    this.router.navigate(['/']);
   }
  });
 }
}
