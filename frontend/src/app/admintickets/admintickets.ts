import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-admintickets',
  styleUrl: './admintickets.css',
  templateUrl: './admintickets.html',
})
export class Admintickets {
 loading = signal(true);
 errorMessage = signal('');

 allTickets: any[] = [];
 shownTickets = signal<any[]>([]);
 selectedTicket = signal<any>(null);

 providers: any[] = [];
 statusOptions: string[] = [];

 collectionFilter = '';
 subtypeFilter = '';
 statusFilter = '';
 providerFilter = '';
 fromDate = '';
 toDate = '';
 sortOrder = 'newest';

 ticketTypes = [
  { value: 'missed_collection', label: 'Missed collection' },
  { value: 'no_updates', label: 'No collection updates' },
  { value: 'damaged_bin', label: 'Damaged bin' },
  { value: 'new_bin', label: 'Request a new bin' },
  { value: 'bulk_pickup', label: 'Schedule a bulk pickup' }
 ];

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const client = this.supabaseService.getClient();
  const { data: providerData, error: providerError } = await client
   .from('haulers')
   .select('id, name, provider_type')
   .order('name', { ascending: true });
  const { data, error } = await client
   .from('tickets')
   .select('id, ticket_type, collection_type, bin_type, missed_date, pickup_date, description, status, reply_text, created_at, hauler_id, residents(first_name, last_name, address_text), haulers(name, provider_type)')
   .order('created_at', { ascending: false });
  if (error || providerError) {
   console.log(error, providerError);
   this.errorMessage.set('We could not load the tickets. Please try again later.');
   this.loading.set(false);
   return;
  }
  this.providers = providerData ?? [];
  this.allTickets = data ?? [];
  for (const ticket of this.allTickets) {
   if (ticket.status && !this.statusOptions.includes(ticket.status)) {
    this.statusOptions.push(ticket.status);
   }
  }
  this.applyFilters();
  this.loading.set(false);
 }

 collectionTypeOf(ticket: any) {
  if (ticket.collection_type === 'recycling' || ticket.bin_type === 'recycling') {
   return 'recycling';
  }
  if (ticket.haulers && ticket.haulers.provider_type === 'Municipal/County recycling') {
   return 'recycling';
  }
  return 'garbage';
 }

 applyFilters() {
  const list = [];
  for (const ticket of this.allTickets) {
   if (this.collectionFilter !== '' && this.collectionTypeOf(ticket) !== this.collectionFilter) {
    continue;
   }
   if (this.subtypeFilter !== '' && ticket.ticket_type !== this.subtypeFilter) {
    continue;
   }
   if (this.statusFilter !== '' && ticket.status !== this.statusFilter) {
    continue;
   }
   if (this.providerFilter !== '' && ticket.hauler_id !== this.providerFilter) {
    continue;
   }
   const dateText = this.createdDateText(ticket.created_at);
   if (this.fromDate !== '' && dateText < this.fromDate) {
    continue;
   }
   if (this.toDate !== '' && dateText > this.toDate) {
    continue;
   }
   list.push(ticket);
  }
  if (this.sortOrder === 'oldest') {
   list.reverse();
  }
  this.shownTickets.set(list);
 }

 resetFilters() {
  this.collectionFilter = '';
  this.subtypeFilter = '';
  this.statusFilter = '';
  this.providerFilter = '';
  this.fromDate = '';
  this.toDate = '';
  this.sortOrder = 'newest';
  this.applyFilters();
 }

 selectTicket(ticket: any) {
  this.selectedTicket.set(ticket);
 }

 closeDetails() {
  this.selectedTicket.set(null);
 }

 fixTime(text: string) {
  if (text.length === 10) {
   return text + 'T00:00:00';
  }
  if (!text.endsWith('Z') && !text.includes('+')) {
   return text.substring(0, 19) + 'Z';
  }
  return text;
 }

 createdDateText(text: string) {
  if (!text) {
   return '';
  }
  return new Date(this.fixTime(text)).toLocaleDateString('en-CA');
 }

 formatDate(text: string) {
  if (!text) {
   return '';
  }
  return new Date(this.fixTime(text)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
 }

 ticketTypeLabel(value: string) {
  for (const type of this.ticketTypes) {
   if (type.value === value) {
    return type.label;
   }
  }
  return 'Request';
 }

 statusLabel(status: string) {
  if (!status) {
   return 'Open';
  }
  return status.charAt(0).toUpperCase() + status.substring(1).replace('_', ' ');
 }

 ticketReference(id: string) {
  if (!id) {
   return '';
  }
  return '#' + id.substring(0, 8).toUpperCase();
 }

 residentName(ticket: any) {
  if (!ticket.residents) {
   return 'Unknown resident';
  }
  return ticket.residents.first_name + ' ' + ticket.residents.last_name;
 }

 residentAddress(ticket: any) {
  if (!ticket.residents) {
   return '';
  }
  return ticket.residents.address_text;
 }

 providerName(ticket: any) {
  if (!ticket.haulers) {
   return 'Not assigned';
  }
  return ticket.haulers.name;
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
