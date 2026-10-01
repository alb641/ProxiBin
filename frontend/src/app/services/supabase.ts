import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.development';

@Injectable({
 providedIn: 'root'
})
export class Supabase {
 private supabase: SupabaseClient;
 constructor() {
  this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
 }
 getClient(): SupabaseClient {
  return this.supabase;
 }
}
