import { Component, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [RouterLink],
  selector: 'app-adminreports',
  styleUrl: './adminreports.css',
  templateUrl: './adminreports.html',
})
export class Adminreports {
 loading = signal(true);
 errorMessage = signal('');

 totalTickets = signal(0);
 byCollection = signal<any[]>([]);
 byIssue = signal<any[]>([]);
 byStatus = signal<any[]>([]);
 byProvider = signal<any[]>([]);

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
  const { data: haulerData, error: haulerError } = await client
   .from('haulers')
   .select('id, name, provider_type')
   .order('name', { ascending: true });
  const { data: ticketData, error: ticketError } = await client
   .from('tickets')
   .select('id, ticket_type, collection_type, bin_type, status, hauler_id, haulers(provider_type)');
  if (haulerError || ticketError) {
   console.log(haulerError, ticketError);
   this.errorMessage.set('We could not load the reports. Please try again later.');
   this.loading.set(false);
   return;
  }
  const tickets = ticketData ?? [];
  this.totalTickets.set(tickets.length);
  let garbage = 0;
  let recycling = 0;
  for (const ticket of tickets) {
   if (this.collectionTypeOf(ticket) === 'recycling') {
    recycling++;
   } else {
    garbage++;
   }
  }

  this.byCollection.set([
   { label: 'Garbage', count: garbage, kind: 'garbage' },
   { label: 'Recycling', count: recycling, kind: 'recycling' }
  ]);

  const issues = [];
  for (const type of this.ticketTypes) {
   let count = 0;
   for (const ticket of tickets) {
    if (ticket.ticket_type === type.value) {
     count++;
    }
   }
   issues.push({ label: type.label, count: count, kind: '' });
  }

  this.byIssue.set(issues);
  const statusNames: string[] = [];
  for (const ticket of tickets) {
   if (ticket.status && !statusNames.includes(ticket.status)) {
    statusNames.push(ticket.status);
   }
  }

  const statuses = [];
  for (const status of statusNames) {
   let count = 0;
   for (const ticket of tickets) {
    if (ticket.status === status) {
     count++;
    }
   }
   statuses.push({ label: status.charAt(0).toUpperCase() + status.substring(1).replace('_', ' '), count: count, kind: '' });
  }

  this.byStatus.set(statuses);
  const providers = [];
  for (const hauler of haulerData ?? []) {
   let count = 0;
   for (const ticket of tickets) {
    if (ticket.hauler_id === hauler.id) {
     count++;
    }
   }
   let kind = 'garbage';
   if (hauler.provider_type === 'Municipal/County recycling') {
    kind = 'recycling';
   }
   providers.push({ label: hauler.name, count: count, kind: kind });
  }
  this.byProvider.set(providers);
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

 barWidth(count: number) {
  if (this.totalTickets() === 0) {
   return '0%';
  }
  return Math.round((count / this.totalTickets()) * 100) + '%';
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
