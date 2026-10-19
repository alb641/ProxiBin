import { Component, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';
import mapboxgl from 'mapbox-gl';
import { environment } from '../../environments/environment.development';

@Component({
  imports: [RouterLink],
  selector: 'app-residentdashboard',
  styleUrl: './residentdashboard.css',
  templateUrl: './residentdashboard.html',
})
export class Residentdashboard {
 loading = signal(true);
 errorMessage = signal('');

 firstName = signal('');
 address = signal('');
 haulerName = signal('');
 garbageDay1 = signal('');
 garbageDay2 = signal('');
 recyclingDay = signal('');
 recyclingFrequency = signal('');
 nextGarbage = signal('');
 nextRecycling = signal('');
 garbageToday = signal(false);
 recyclingToday = signal(false); 

 map: any;

 truckId = '';
 haulerId = '';
 truckMarker: any;
 noTruck = signal(false);

 residentId = '';
 todayPickups = signal<any[]>([]);

 animationId: any = null;
 pickupsDone = false;

 homeLat: any = null;
 homeLng: any = null;

 currentStop = signal(0);
 currentType = signal('');

 channel: any;

 monthOffset = 0;
 monthTitle = signal('');
 calendarDays = signal<any[]>([]);
 
 dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const client = this.supabaseService.getClient();
  const { data } = await client.auth.getSession();
  if (!data.session) {
   this.router.navigate(['/signin']);
   return;
  }
  const { data: resident, error } = await client
   .from('residents')
   .select('*')
   .eq('user_id', data.session.user.id)
   .maybeSingle();
  if (error) {
   console.log(error)
   this.errorMessage.set('We could not load your information. Please try again later.');
   this.loading.set(false);
   return;
  }
  if (!resident) {
   this.errorMessage.set('We could not find our ProxiBin profile.');
   this.loading.set(false);
   return;
  }
  this.firstName.set(resident.first_name ?? '');
  this.residentId = resident.id;
  this.homeLat = resident.lat;
  this.homeLng = resident.lng;
  this.address.set(resident.address_text ?? '');
  this.garbageDay1.set(resident.garbage_day_1 ?? '');
  this.garbageDay2.set(resident.garbage_day_2 ?? '');
  this.recyclingDay.set(resident.recycling_day ?? '');
  this.recyclingFrequency.set(resident.recycling_frequency ?? '');
  if (resident.garbage_day_1) {
   let garbageDays = this.daysUntil(resident.garbage_day_1);
   if (resident.garbage_day_2) {
    const secondDays = this.daysUntil(resident.garbage_day_2);
    if (secondDays < garbageDays) {
     garbageDays = secondDays;
    }
   }
   this.nextGarbage.set(this.dayLabel(garbageDays));
   this.garbageToday.set(garbageDays === 0);
  }
  if (resident.recycling_day && resident.recycling_frequency === 'weekly') {
   const recyclingDays = this.daysUntil(resident.recycling_day);
   this.nextRecycling.set(this.dayLabel(recyclingDays));
   this.recyclingToday.set(recyclingDays === 0);
  }
  if (!resident.hauler_id) {
   this.errorMessage.set('You have not selected a hauler yet.');
   this.loading.set(false);
   return;
  }
  this.haulerId = resident.hauler_id;
  const { data: hauler } = await client 
   .from('haulers')
   .select('name')
   .eq('id', resident.hauler_id)
   .maybeSingle();
  if (hauler) {
   this.haulerName.set(hauler.name);
  } else {
   this.haulerName.set('No hauler selected yet');
  }
  this.loading.set(false);
  await this.loadProgress();
  this.buildCalendar();
  setTimeout(() => {
   this.createMap(); 
   this.showHome();
   if (this.todayPickups().length > 0 && !this.allPickupsDone()) {
    this.loadTruck();
   } else {
    this.pickupsDone = true;
   }
   this.startLiveUpdates();
  }, 0);
 }

 daysUntil(dayName: string) {
  const todayNumber = new Date().getDay();
  const dayNumber = this.dayNames.indexOf(dayName);
  let days = dayNumber - todayNumber;
  if (days < 0) {
   days = days + 7;
  }
  return days;
 }

 dayLabel(days: number) {
  if (days === 0) {
   return 'Today';
  }
  if (days === 1) {
   return 'Tomorrow';
  }
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
 }
 
 async buildCalendar() {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const firstDay = new Date(today.getFullYear(), today.getMonth() + this.monthOffset, 1);
  const year = firstDay.getFullYear();
  const month = firstDay.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  this.monthTitle.set(firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  const firstText = new Date(year, month, 1).toLocaleDateString('en-CA');
  const lastText = new Date(year, month, daysInMonth).toLocaleDateString('en-CA');
  const client = this.supabaseService.getClient();
  const { data: monthRows } = await client
   .from('collection_progress')
   .select('schedule_date, collection_type, status')
   .eq('resident_id', this.residentId)
   .gte('schedule_date', firstText)
   .lte('schedule_date', lastText);
  const rows = monthRows || [];
  const days = [];
  for (let i = 0; i < firstDay.getDay(); i++) {
   days.push({ number: '', garbage: false, recycling: false, today: false, past: false, done: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
   const date = new Date(year, month, d);
   const dayName = this.dayNames[date.getDay()];
   const dateText = date.toLocaleDateString('en-CA');
   let garbageRow = false;
   let recyclingRow = false;
   let rowCount = 0;
   let doneCount = 0;
   for (const row of rows) {
    if (row.schedule_date === dateText) {
     rowCount++;
     if (row.collection_type === 'garbage') {
      garbageRow = true;
     }
     if (row.collection_type === 'recycling') {
      recyclingRow = true;
     }
     if (row.status === 'completed') {
      doneCount++;
     }
    }
   }
   days.push({
    number: d,
    garbage: dayName === this.garbageDay1() || dayName === this.garbageDay2() || garbageRow,
    recycling: (this.recyclingFrequency() === 'weekly' && dayName === this.recyclingDay()) || recyclingRow,
    today: date.getTime() === startOfToday.getTime(),
    past: date < startOfToday,
    done: rowCount > 0 && doneCount === rowCount
   });
  }
  this.calendarDays.set(days);
 }
 
 previousMonth() {
  if (this.monthOffset > 0) {
   this.monthOffset = this.monthOffset - 1;
   this.buildCalendar();
  }
 }
 
 nextMonth() {
  this.monthOffset = this.monthOffset + 1;
  this.buildCalendar();
 }
 
 createMap() {
  mapboxgl.accessToken = environment.mapboxToken;
  this.map = new mapboxgl.Map({
   container: 'map',
   style: 'mapbox://styles/mapbox/light-v11',
   center: [-74.437, 40.645],
   zoom: 14
  });
  this.map.addControl(new mapboxgl.NavigationControl());
 }

 async loadTruck() {
  const client = this.supabaseService.getClient();
  const { data: position, error } = await client
   .from('truck_positions')
   .select('lat, lng, updated_at, current_route_order, current_collection_type')
   .eq('truck_id', this.truckId)
   .maybeSingle();
  if (error || !position || position.lat == null || position.lng == null) {
   if (error) {
    console.log(error);
   }
   this.noTruck.set(true);
   return;
  }
  this.noTruck.set(false);
  this.currentStop.set(position.current_route_order || 0);
  this.currentType.set(position.current_collection_type || '');
  this.showTruck(position.lat, position.lng);
 }

 showTruck(lat: number, lng: number) {
  if (this.pickupsDone) {
   return;
  }
  if (!this.truckMarker) {
   const truckIcon = document.createElement('img');
   truckIcon.src = 'truck-icon.svg';
   truckIcon.alt = "Your hauler's truck";
   truckIcon.className = 'truckmarker';
   truckIcon.setAttribute('aria-label', "Your hauler's truck");
   this.truckMarker = new mapboxgl.Marker({ element: truckIcon })
    .setLngLat([lng, lat])
    .addTo(this.map);
   if (this.homeLat != null && this.homeLng != null) {
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([lng, lat]);
    bounds.extend([this.homeLng, this.homeLat]);
    this.map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
   } else {
    this.map.setCenter([lng, lat]);
   }
  } else {
   const old = this.truckMarker.getLngLat();
   this.animateTruck(old.lng, old.lat, lng, lat);
  }
  this.updateRoute(lng, lat);
 }

 animateTruck(fromLng: number, fromLat: number, toLng: number, toLat: number) {
  if (this.animationId) {
   cancelAnimationFrame(this.animationId);
  }
  const duration = 1800;
  const start = performance.now();
  const step = (now: number) => {
   const progress = Math.min((now - start) / duration, 1); 
   const lng = fromLng + (toLng - fromLng) * progress;
   const lat = fromLat + (toLat - fromLat) * progress;
   this.truckMarker.setLngLat([lng, lat]);
   if (progress < 1) {
    this.animationId = requestAnimationFrame(step);
   }
  };
  this.animationId = requestAnimationFrame(step);
 }
 
 showHome() {
  if (this.homeLat == null || this.homeLng == null) {
   return;
  }
  const homeIcon = document.createElement('img');
  homeIcon.src = 'home-icon.svg';
  homeIcon.alt = 'Your home';
  homeIcon.className = 'homemarker';
  new mapboxgl.Marker({ element: homeIcon })
   .setLngLat([this.homeLng, this.homeLat])
   .addTo(this.map);
  this.map.setCenter([this.homeLng, this.homeLat]);
 }
 
 async updateRoute(truckLng: number, truckLat: number) {
  if (this.homeLat == null || this.homeLng == null) {
   return;
  }
  if (!this.map.isStyleLoaded()) {
   this.map.once('load', () => this.updateRoute(truckLng, truckLat));
   return; 
  }
  let coordinates: any[] = [
   [truckLng, truckLat],
   [this.homeLng, this.homeLat]
  ];
  const url =
   'https://api.mapbox.com/directions/v5/mapbox/driving/' +
   truckLng + ',' + truckLat + ';' + this.homeLng + ',' + this.homeLat +
   '?geometries=geojson&access_token=' + environment.mapboxToken;
  try {
   const response = await fetch(url);
   const result = await response.json();
   if (this.pickupsDone) {
    return;
   }
   if (result.routes && result.routes.length > 0) {
    coordinates = result.routes[0].geometry.coordinates;
   }
  } catch (error) {
   console.log('Could not load the road route:', error);
  }
  const line: any = {
   type: 'Feature',
   geometry: { 
    type: 'LineString',
    coordinates: coordinates
   }
  };
  const source = this.map.getSource('route');
  if (source) {
   source.setData(line);
  } else {
   this.map.addSource('route', { type: 'geojson', data: line});
   this.map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    paint: {
     'line-color': '#086788',
     'line-width': 5,
     'line-dasharray': [1.5, 1.5]
    }
   });
  }
 }

 startLiveUpdates() {
  const client = this.supabaseService.getClient();
   this.channel = client 
    .channel('dashboard-updates')
    .on(
     'postgres_changes',
     { event: 'UPDATE', schema: 'public', table: 'truck_positions', filter: 'truck_id=eq.' + this.truckId },
     (payload: any) => {
      const position = payload.new;
      this.currentStop.set(position.current_route_order || 0);
      this.currentType.set(position.current_collection_type || '');
      if (position.lat != null && position.lng != null && this.todayPickups().length > 0) {
       this.noTruck.set(false);
       this.showTruck(position.lat, position.lng);
      }
     }
    )
    .on(
     'postgres_changes',
     { event: '*', schema: 'public', table: 'collection_progress', filter: 'resident_id=eq.' + this.residentId },
     async () => {
      await this.loadProgress();
      this.buildCalendar();
      if (this.allPickupsDone() && !this.pickupsDone) {
       this.pickupsDone = true;
       setTimeout(() => {
        this.hideTruck();
       }, 5000);
      } else if (!this.allPickupsDone() && !this.truckMarker && this.todayPickups().length > 0) {
       this.pickupsDone = false;
       this.loadTruck();
      }
     }
    )
    .subscribe((status: string) => {
     console.log('Live updates:', status);
    });
 }
 
 ngOnDestroy() {
  if (this.animationId) {
   cancelAnimationFrame(this.animationId);
  }
  if (this.map) {
   this.map.remove();
  }
  if (this.channel) {
   const client = this.supabaseService.getClient();
   client.removeChannel(this.channel);
  }
 }

 allPickupsDone() {
  const pickups = this.todayPickups();
  if (pickups.length === 0) {
   return false;
  }
  for (const pickup of pickups) {
   if (pickup.status !== 'completed') {
    return false;
   }
  }
  return true;
 }
 
 hideTruck() {
  this.pickupsDone = true;
  if (this.animationId) {
   cancelAnimationFrame(this.animationId);
  } 
  if (this.truckMarker) {
   this.truckMarker.remove();
   this.truckMarker = null;
  }
  if (this.map.getLayer('route')) {
   this.map.removeLayer('route');
  }
  if (this.map.getSource('route')) {
   this.map.removeSource('route');
  }
  this.map.flyTo({ center: [this.homeLng, this.homeLat], zoom: 15 });
 }

 async loadProgress() {
  const client = this.supabaseService.getClient();
  const today = new Date().toLocaleDateString('en-CA');
  const { data, error } = await client 
   .from('collection_progress')
   .select('collection_type, status, route_order, completed_at, truck_id')
   .eq('resident_id', this.residentId)
   .eq('schedule_date', today)
   .order('collection_type', { ascending: true });
  if (error) {
   console.log(error); 
   return; 
  }
  this.todayPickups.set(data ?? []);
  if (data && data.length > 0) {
   this.truckId = data[0].truck_id;
  }
 }
 
 statusLabel(status: string) {
  if (status === 'approaching') {
   return 'Approaching';
  }
  if (status === 'completed') {
   return 'Completed';
  }
  return 'Upcoming';
 }

 stopsAwayText(pickup: any) {
  if (pickup.status === 'completed') {
   return '';
  }
  if (this.currentStop() === 0 || this.currentType() !== pickup.collection_type) {
   return '';
  }
  const stops = pickup.route_order - this.currentStop();
  if (stops < 0) {
   return '';
  }
  if (stops === 0) {
   return 'Next stop!';
  }
  if (stops === 1) {
   return '1 stop away';
  }
  return stops + ' stops away';
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 }
}
