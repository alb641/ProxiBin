import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';
import { environment } from '../../environments/environment.development';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-profile',
  styleUrl: './profile.css',
  templateUrl: './profile.html',
})
export class Profile {
 loading = signal(true);
 errorMessage = signal('');
 
 userId = '';

 firstName = '';
 lastName = '';
 phone = '';
 emailAlerts = true;
 firstNameError = '';
 lastNameError = '';
 phoneError = '';
 infoSaving = signal(false);
 infoMessage = signal('');
 infoError = signal('');

 street = '';
 town = '';
 state = 'NJ';
 zipcode = '';
 savedAddress = '';
 streetError = '';
 townError = '';
 zipcodeError = '';
 addressSaving = signal(false);
 addressMessage = signal('');
 addressError = signal('');
 
 haulerName = '';
 recyclingProviderName = '';
 garbageDay1 = '';
 garbageDay2 = '';
 garbageDay1Error = '';
 garbageDay2Error = ''; 
 scheduleSaving = signal(false);
 scheduleMessage = signal('');
 scheduleError = signal('');
 weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

 lettersOnly = /^[A-Za-z ]+$/;
 lettersAndNumbers = /^[A-Za-z0-9 ]+$/;
 zipcodeRule = /^[0-9]{5}$/;
 phoneRule = /^[0-9]{10}$/;

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
  const client = this.supabaseService.getClient();
  const { data } = await client.auth.getSession();
  if (!data.session) {
   this.router.navigate(['/signin']);
   return;
  }
  this.userId = data.session.user.id; 
  const { data: resident, error } = await client
   .from('residents')
   .select('*')
   .eq('user_id', this.userId)
   .maybeSingle();
  if (error || !resident) {
   console.log(error);
   this.errorMessage.set('We could not load your profile. Please try again later.');
   this.loading.set(false);
   return;
  }
  this.fillForm(resident);
  if (resident.hauler_id) {
   const { data: hauler } = await client
    .from('haulers')
    .select('name')
    .eq('id', resident.hauler_id)
    .maybeSingle();
   if (hauler) {
    this.haulerName = hauler.name;
   }
  }
  const { data: county } = await client
   .from('haulers')
   .select('name')
   .eq('provider_type', 'Municipal/County recycling')
   .limit(1)
   .maybeSingle();
  if (county) {
   this.recyclingProviderName = county.name;
  }
  this.loading.set(false);
 }
 
 fillForm(resident: any) {
  this.firstName = resident.first_name ?? '';
  this.lastName = resident.last_name ?? '';
  this.phone = resident.phone ?? '';
  this.emailAlerts = resident.email_alerts ?? true;
  this.savedAddress = resident.address_text ?? '';
  if (resident.address_text) {
   const parts = resident.address_text.split(', ');
   if (parts.length === 3) {
    this.street = parts[0];
    this.town = parts [1];
    const stateAndZip = parts[2].split(' ');
    this.state = stateAndZip[0];
    this.zipcode = stateAndZip[1] ?? '';
   }
  }
  this.garbageDay1 = resident.garbage_day_1 ?? '';
  this.garbageDay2 = resident.garbage_day_2 ?? '';
 }

 validateInfo() {
  this.firstNameError = '';
  this.lastNameError = ''; 
  this.phoneError = '';
  let isValid = true;
  if (this.firstName.trim() === '') {
   this.firstNameError = 'Please enter your first name.';
   isValid = false;
  } else if (!this.lettersOnly.test(this.firstName)) {
   this.firstNameError = 'First name can only contain letters.';
   isValid = false;
  }
  if (this.lastName.trim() === '') {
   this.lastNameError = 'Please enter your last name.';
   isValid = false;
  } else if (!this.lettersOnly.test(this.lastName)) {
   this.lastNameError = 'Last name can only contain letters.';
   isValid = false;
  }
  if (this.phone.trim() === '') {
   this.phoneError = 'Please enter your phone number.';
   isValid = false;
  } else if (!this.phoneRule.test(this.phone)) {
   this.phoneError = 'Phone number must be 10 numbers.';
   isValid = false;
  }
  return isValid;
 }

 async saveInfo() {
  this.infoMessage.set('');
  this.infoError.set('');
  if (this.validateInfo() === false) {
   return;
  }
  this.infoSaving.set(true);
  const client = this.supabaseService.getClient();
  const { error } = await client
   .from('residents')
   .update({
    first_name: this.firstName.trim(),
    last_name: this.lastName.trim(),
    phone: this.phone.trim(),
    email_alerts: this.emailAlerts
   })
   .eq('user_id', this.userId);
  this.infoSaving.set(false);
  if (error) {
   console.log(error);
   this.infoError.set('We could not save your information. Please try again.');
   return;
  }
  this.infoMessage.set('Your information has been saved.');
 }

 validateAddress() {
  this.streetError = '';
  this.townError = '';
  this.zipcodeError = '';
  let isValid = true;
  if (this.street.trim() === '') {
   this.streetError = 'Please enter your street address.';
   isValid = false;
  } else if (!this.lettersAndNumbers.test(this.street)) {
   this.streetError = 'Street address can only contain letters and numbers.';
   isValid = false;
  }
  if (this.town.trim() === '') {
   this.townError = 'Please enter your town.';
   isValid = false;
  } else if (!this.lettersOnly.test(this.town)) {
   this.townError = 'Town can only contain letters.';
   isValid = false;
  }
  if (this.zipcode.trim() === '') {
   this.zipcodeError = 'Please enter your zip code.';
   isValid = false;
  } else if (!this.zipcodeRule.test(this.zipcode)) {
   this.zipcodeError = 'Zip code must be 5 numbers.';
   isValid = false;
  }
  return isValid;
 }

 async inServiceArea() {
  const client = this.supabaseService.getClient();
  const { data, error } = await client
   .from('service_area')
   .select('*')
   .ilike('town', this.town.trim())
   .ilike('state', this.state.trim())
   .eq('zipcode', this.zipcode.trim())
   .eq('active', true);
  if (error) {
   console.log(error);
   return false;
  }
  return data.length > 0;
 }

 async getCoordinates(fullAddress: string) {
  const url = 
   'https://api.mapbox.com/search/geocode/v6/forward?q=' +
   encodeURIComponent(fullAddress) +
   '&country=us&limit=1&proximity=-74.437,40.645' +
   '&access_token=' + environment.mapboxToken;
  try {
   const response = await fetch(url);
   const result = await response.json();
   if (result.features && result.features.length > 0) {
    const coords = result.features[0].geometry.coordinates;
    return { lat: coords[1], lng: coords[0] };
   }
  } catch (error) {
   console.log('Could not find coordinates for the address:', error);
  }
  return null;
 }

 scheduleText() {
  let text = 'Garbage: ' + this.garbageDay1;
  if (this.garbageDay2 !== '') {
   text = text + ' and ' + this.garbageDay2;
  }
  text = text + '\nRecycling: every other Thursday (' + this.recyclingProviderName + ')';
  return text;
 }

 async saveAddress() {
  this.addressMessage.set('');
  this.addressError.set('');
  if (this.validateAddress() === false) {
   return;
  }
  const address = this.street.trim() + ', ' + this.town.trim() + ', ' + this.state + ' ' + this.zipcode.trim();
  if (address === this.savedAddress) {
   this.addressMessage.set('Your address has not changed.');
   return;
  }
  const keepSchedule = confirm(
   'Your pickup schedule will stay the same: \n\n' + this.scheduleText() +
   '\n\nIs that still correct? Press OK to save your new address, or Cancel to change your pickup days first.'
  );
  if (keepSchedule === false) {
   return;
  }
  this.addressSaving.set(true);
  const available = await this.inServiceArea();
  if (available === false) {
   this.addressSaving.set(false);
   this.addressError.set("ProxiBin isn't available at this address yet. Your address was not changed.");
   return;
  }
  const coords = await this.getCoordinates(address);
  if (!coords) {
   this.addressSaving.set(false);
   this.addressError.set('We could not find this address on the map. Please check it and try again.');
   return;
  }
  const client = this.supabaseService.getClient();
  const { error } = await client
   .from('residents')
   .update({
    address_text: address,
    lat: coords.lat,
    lng: coords.lng
   })
   .eq('user_id', this.userId);
  this.addressSaving.set(false);
  if (error) {
   console.log(error);
   this.addressError.set('We could not save your address. Please try again.');
   return;
  }
  this.savedAddress = address;
  this.addressMessage.set('Your address has been saved. Your dashboard map will show your new home.');
 }

 validateSchedule() {
  this.garbageDay1Error = '';
  this.garbageDay2Error = '';
  let isValid = true;
  if (this.garbageDay1 === '') {
   this.garbageDay1Error = 'Please select a day.';
   isValid = false;
  }
  if (this.garbageDay2 !== '' && this.garbageDay2 === this.garbageDay1) {
   this.garbageDay2Error = 'Your second garbage day must be different from the first.';
   isValid = false;
  }
  return isValid;
 }

 async saveSchedule() {
  this.scheduleMessage.set('');
  this.scheduleError.set('');
  if (this.isXcel()) {
   return;
  }
  if (this.validateSchedule() === false) {
   return;
  }
  const keepAddress = confirm(
   'Your address will stay the same:\n\n' + this.savedAddress +
   '\n\nIs that still correct? Press OK to save your new pickup days, or Cancel to change your address first.'
  );
  if (keepAddress === false) {
   return;
  }
  this.scheduleSaving.set(true);
  const client = this.supabaseService.getClient();
  const { error } = await client
   .from('residents')
   .update({
    garbage_day_1: this.garbageDay1, 
    garbage_day_2: this.garbageDay2 === '' ? null : this.garbageDay2
   })
   .eq('user_id', this.userId);
  this.scheduleSaving.set(false);
  if (error) {
   console.log(error);
   this.scheduleError.set('We could not save your pickup days. Please try again.');
   return;
  }
  this.scheduleMessage.set('Your pickup days have been saved.');
 }

 isXcel() {
  return this.haulerName === 'X-Cel Carting';
 }

 async signOut() {
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.router.navigate(['/']);
 } 
}
