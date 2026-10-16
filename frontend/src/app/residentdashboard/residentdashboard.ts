import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [RouterLink],
  selector: 'app-residentdashboard',
  styleUrl: './residentdashboard.css',
  templateUrl: './residentdashboard.html',
})
export class Residentdashboard {
 constructor(private supabaseService: Supabase, private router: Router) {}
 
 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
