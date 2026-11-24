import { Component, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';
import mapboxgl from 'mapbox-gl';
import { environment } from '../../environments/environment.development';

@Component({
  imports: [RouterLink],
  selector: 'app-proxibinadmin',
  styleUrl: './proxibinadmin.css',
  templateUrl: './proxibinadmin.html',
})
export class Proxibinadmin {
 loading = signal(true);
 errorMessage = signal('');

 adminEmail = '';
 todayName = '';
 todayText = '';
 todayLabel = '';

 haulers: any[] = [];
 residents: any[] = [];
 trucks: any[] = [];
 runs: any[] = [];

 recyclingProviderId = '';
 recyclingProviderName = '';
 recyclingToday = signal(false);

 totalResidents = signal(0);
 openTickets = signal(0);
 activeGarbage = signal(0);
 activeRecycling = signal(0);
 garbageScheduled = signal(0);
 recyclingScheduled = signal(0);

 map: any;
 channel: any;
 latestPositions: any = {};
 truckMarkers: any = {};

 dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const today = new Date();
  this.todayName = this.dayNames[today.getDay()];
  this.todayText = today.toLocaleDateString('en-CA');
  this.todayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const client = this.supabaseService.getClient();
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) {
   this.adminEmail = sessionData.session.user.email ?? '';
  }
  const { data: haulerData, error: haulerError } = await client
   .from('haulers')
   .select('id, name, provider_type')
   .order('name', { ascending: true });
  const { data: residentData, error: residentError } = await client
   .from('residents')
   .select('id, hauler_id, garbage_day_1, garbage_day_2, is_active, onboarding_complete');
  const { data: truckData, error: truckError } = await client
   .from('trucks')
   .select('id, hauler_id, truck_name, is_active');
  const { data: runData, error: runError } = await client
   .from('collection_runs')
   .select('id, truck_id, collection_type, status')
   .eq('schedule_date', this.todayText);
  const { data: positionData, error: positionError } = await client
   .from('truck_positions')
   .select('truck_id, lat, lng, updated_at, current_route_order, current_collection_type');
  const { data: recyclingData, error: recyclingError } = await client.rpc('get_recycling_dates', {
   start_date: this.todayText,
   end_date: this.todayText
  });
  const { count: openCount, error: ticketError } = await client
   .from('tickets')
   .select('id', { count: 'exact', head: true })
   .neq('status', 'resolved');
  if (haulerError || residentError || truckError || runError || positionError || recyclingError || ticketError) {
   console.log(haulerError, residentError, truckError, runError, positionError, recyclingError, ticketError);
   this.errorMessage.set('We could not load the dispatcher dashboard. Please try again later.');
   this.loading.set(false);
   return;
  }
  this.residents = residentData ?? [];
  this.trucks = truckData ?? [];
  this.runs = runData ?? [];
  this.recyclingToday.set(recyclingData && recyclingData.length > 0);
  this.openTickets.set(openCount ?? 0);
  for (const position of positionData ?? []) {
   this.latestPositions[position.truck_id] = position;
  }
  for (const hauler of haulerData ?? []) {
   if (hauler.provider_type === 'Municipal/County recycling') {
    this.recyclingProviderId = hauler.id;
    this.recyclingProviderName = hauler.name;
   } else {
    this.haulers.push(hauler);
   }
  }
  this.buildStats();
  this.loading.set(false);
  setTimeout(() => {
   this.createMap();
   this.showTrucks();
   this.startLiveUpdates();
  }, 0);
 }

 isEligible(resident: any) {
  return resident.is_active !== false && resident.onboarding_complete === true;
 }

 buildStats() {
  let total = 0;
  let garbage = 0;
  for (const resident of this.residents) {
   if (this.isEligible(resident)) {
    total++;
    if (resident.garbage_day_1 === this.todayName || resident.garbage_day_2 === this.todayName) {
     garbage++;
    }
   }
  }
  this.totalResidents.set(total);
  this.garbageScheduled.set(garbage);
  if (this.recyclingToday()) {
   this.recyclingScheduled.set(total);
  } else {
   this.recyclingScheduled.set(0);
  }
  let activeGarbage = 0;
  let activeRecycling = 0;
  for (const run of this.runs) {
   if (run.status === 'in_progress') {
    if (run.collection_type === 'recycling') {
     activeRecycling++;
    } else {
     activeGarbage++;
    }
   }
  }
  this.activeGarbage.set(activeGarbage);
  this.activeRecycling.set(activeRecycling);
 }

 truckOnActiveRun(truckId: string) {
  for (const run of this.runs) {
   if (run.truck_id === truckId && run.status === 'in_progress') {
    return true;
   }
  }
  return false;
 }

 createMap() {
  mapboxgl.accessToken = environment.mapboxToken;
  this.map = new mapboxgl.Map({
   container: 'adminmap',
   style: 'mapbox://styles/mapbox/light-v11',
   center: [-74.437, 40.645],
   zoom: 13
  });
  this.map.addControl(new mapboxgl.NavigationControl());
 }

 findTruck(truckId: string) {
  for (const truck of this.trucks) {
   if (truck.id === truckId) {
    return truck;
   }
  }
  return null;
 }

 haulerNameById(haulerId: string) {
  if (haulerId === this.recyclingProviderId) {
   return this.recyclingProviderName;
  }
  for (const hauler of this.haulers) {
   if (hauler.id === haulerId) {
    return hauler.name;
   }
  }
  return 'Unknown provider';
 }

 popupBox(position: any) {
  const truck = this.findTruck(position.truck_id);
  const box = document.createElement('div');
  let text = truck.truck_name + '\n' + this.haulerNameById(truck.hauler_id);
  if (position.current_collection_type === 'recycling') {
   text = text + '\nRecycling route';
  } else if (position.current_collection_type === 'garbage') {
   text = text + '\nGarbage route';
  }
  if (position.current_route_order) {
   text = text + '\nCurrent stop: ' + position.current_route_order;
  }
  if (position.updated_at) {
   text = text + '\nLast update: ' + new Date(position.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  box.innerText = text;
  return box;
 }

 showTruck(position: any) {
  this.latestPositions[position.truck_id] = position;
  const marker = this.truckMarkers[position.truck_id];
  const truck = this.findTruck(position.truck_id);
  let shouldShow = true;
  if (!truck || truck.is_active !== true) {
   shouldShow = false;
  }
  if (!this.truckOnActiveRun(position.truck_id)) {
   shouldShow = false;
  }
  if (position.lat == null || position.lng == null) {
   shouldShow = false;
  }
  if (shouldShow === false) {
   if (marker) {
    marker.remove();
    this.truckMarkers[position.truck_id] = null;
   }
   return;
  }
  if (marker) {
   marker.setLngLat([position.lng, position.lat]);
   marker.getPopup().setDOMContent(this.popupBox(position));
   return;
  }
  const icon = document.createElement('img');
  icon.src = 'truck-icon.svg';
  icon.alt = truck.truck_name;
  if (truck.hauler_id === this.recyclingProviderId) {
   icon.className = 'truckmarker recyclingmarker';
  } else {
   icon.className = 'truckmarker garbagemarker';
  }
  const popup = new mapboxgl.Popup({ offset: 24 }).setDOMContent(this.popupBox(position));
  this.truckMarkers[position.truck_id] = new mapboxgl.Marker({ element: icon })
   .setLngLat([position.lng, position.lat])
   .setPopup(popup)
   .addTo(this.map);
 }

 refreshTrucks() {
  for (const truckId in this.latestPositions) {
   this.showTruck(this.latestPositions[truckId]);
  }
 }

 showTrucks() {
  this.refreshTrucks();
  const bounds = new mapboxgl.LngLatBounds();
  let count = 0;
  for (const truckId in this.truckMarkers) {
   if (this.truckMarkers[truckId]) {
    bounds.extend(this.truckMarkers[truckId].getLngLat());
    count++;
   }
  }
  if (count > 1) {
   this.map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
  } else if (count === 1) {
   this.map.setCenter(bounds.getCenter());
  }
 }

 async loadRuns() {
  const client = this.supabaseService.getClient();
  const { data, error } = await client
   .from('collection_runs')
   .select('id, truck_id, collection_type, status')
   .eq('schedule_date', this.todayText);
  if (error) {
   console.log(error);
   return;
  }
  this.runs = data ?? [];
 }

 async loadOpenTickets() {
  const client = this.supabaseService.getClient();
  const { count, error } = await client
   .from('tickets')
   .select('id', { count: 'exact', head: true })
   .neq('status', 'resolved');
  if (error) {
   console.log(error);
   return;
  }
  this.openTickets.set(count ?? 0);
 }

 startLiveUpdates() {
  const client = this.supabaseService.getClient();
  this.channel = client.channel('admin-updates');
  this.channel.on(
   'postgres_changes',
   { event: 'UPDATE', schema: 'public', table: 'truck_positions' },
   (payload: any) => {
    this.showTruck(payload.new);
   }
  );
  this.channel.on(
   'postgres_changes',
   { event: '*', schema: 'public', table: 'collection_runs', filter: 'schedule_date=eq.' + this.todayText },
   async () => {
    await this.loadRuns();
    this.buildStats();
    this.refreshTrucks();
   }
  );
  this.channel.on(
   'postgres_changes',
   { event: '*', schema: 'public', table: 'tickets' },
   () => {
    this.loadOpenTickets();
   }
  );
  this.channel.subscribe((status: string) => {
   console.log('Admin live updates:', status);
  });
 }

 ngOnDestroy() {
  if (this.map) {
   this.map.remove();
  }
  if (this.channel) {
   const client = this.supabaseService.getClient();
   client.removeChannel(this.channel);
  }
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
