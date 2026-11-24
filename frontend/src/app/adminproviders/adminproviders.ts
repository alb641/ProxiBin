import { Component, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [RouterLink],
  selector: 'app-adminproviders',
  styleUrl: './adminproviders.css',
  templateUrl: './adminproviders.html',
})
export class Adminproviders {
 loading = signal(true);
 errorMessage = signal('');

 garbageProviders = signal<any[]>([]);
 recyclingProviders = signal<any[]>([]);

 residents: any[] = [];
 trucks: any[] = [];

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const client = this.supabaseService.getClient();
  const { data: haulerData, error: haulerError } = await client
   .from('haulers')
   .select('id, name, provider_type')
   .order('name', { ascending: true });
  const { data: residentData, error: residentError } = await client
   .from('residents')
   .select('id, hauler_id, onboarding_complete');
  const { data: truckData, error: truckError } = await client
   .from('trucks')
   .select('id, hauler_id, is_active');
  if (haulerError || residentError || truckError) {
   console.log(haulerError, residentError, truckError);
   this.errorMessage.set('We could not load the providers. Please try again later.');
   this.loading.set(false);
   return;
  }
  this.residents = residentData ?? [];
  this.trucks = truckData ?? [];
  const garbage = [];
  const recycling = [];
  for (const hauler of haulerData ?? []) {
   if (hauler.provider_type === 'Municipal/County recycling') {
    recycling.push(hauler);
   } else {
    garbage.push(hauler);
   }
  }
  this.garbageProviders.set(garbage);
  this.recyclingProviders.set(recycling);
  this.loading.set(false);
 }

 residentCount(provider: any) {
  let count = 0;
  for (const resident of this.residents) {
   if (resident.onboarding_complete !== true) {
    continue;
   }
   if (provider.provider_type === 'Municipal/County recycling' || resident.hauler_id === provider.id) {
    count++;
   }
  }
  return count;
 }

 truckCount(provider: any) {
  let count = 0;
  for (const truck of this.trucks) {
   if (truck.hauler_id === provider.id && truck.is_active === true) {
    count++;
   }
  }
  return count;
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
