import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-adminresidents',
  styleUrl: './adminresidents.css',
  templateUrl: './adminresidents.html',
})
export class Adminresidents {
 loading = signal(true);
 errorMessage = signal('');

 haulers: any[] = [];
 residents: any[] = [];
 shownResidents = signal<any[]>([]);

 recyclingProviderName = '';

 haulerFilter = '';
 searchText = '';

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const client = this.supabaseService.getClient();
  const { data: haulerData, error: haulerError } = await client
   .from('haulers')
   .select('id, name, provider_type')
   .order('name', { ascending: true });
  const { data: residentData, error: residentError } = await client
   .from('residents')
   .select('id, first_name, last_name, address_text, hauler_id, garbage_day_1, garbage_day_2, is_active, onboarding_complete')
   .eq('onboarding_complete', true)
   .order('last_name', { ascending: true });
  if (haulerError || residentError) {
   console.log(haulerError, residentError);
   this.errorMessage.set('We could not load the residents. Please try again later.');
   this.loading.set(false);
   return;
  }
  for (const hauler of haulerData ?? []) {
   if (hauler.provider_type === 'Municipal/County recycling') {
    this.recyclingProviderName = hauler.name;
   } else {
    this.haulers.push(hauler);
   }
  }
  this.residents = residentData ?? [];
  this.applyFilters();
  this.loading.set(false);
 }

 applyFilters() {
  const list = [];
  const search = this.searchText.trim().toLowerCase();
  for (const resident of this.residents) {
   if (this.haulerFilter !== '' && resident.hauler_id !== this.haulerFilter) {
    continue;
   }
   if (search !== '') {
    const name = (resident.first_name + ' ' + resident.last_name).toLowerCase();
    const address = (resident.address_text ?? '').toLowerCase();
    if (!name.includes(search) && !address.includes(search)) {
     continue;
    }
   }
   list.push(resident);
  }
  this.shownResidents.set(list);
 }

 resetFilters() {
  this.haulerFilter = '';
  this.searchText = '';
  this.applyFilters();
 }

 garbageHaulerName(resident: any) {
  for (const hauler of this.haulers) {
   if (hauler.id === resident.hauler_id) {
    return hauler.name;
   }
  }
  return 'No hauler selected';
 }

 garbageDaysText(resident: any) {
  let text = resident.garbage_day_1 ?? '';
  if (resident.garbage_day_2) {
   text = text + ' and ' + resident.garbage_day_2;
  }
  return text;
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
