import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-signup',
  styleUrl: './signup.css',
  templateUrl: './signup.html',
})
export class Signup {
 step = signal(0)
 errorMessage = signal('');
 checking = signal(false);
 inServiceArea = signal(false);
 setupComplete = signal(false);

 userId= '';
 
 email = '';
 password = '';

 emailError = '';
 passwordError = '';

 firstName = '';
 lastName = '';
 street = '';
 town = '';
 state = 'NJ';
 zipcode = '';
 phone = '';
 ownerType = '';
 ageConfirmed = false;
 
 firstNameError = '';
 lastNameError = '';
 streetError = '';
 townError = '';
 zipcodeError = '';
 phoneError = '';
 ownerTypeError = '';
 ageError = '';
 
 lettersOnly = /^[A-Za-z ]+$/;
 lettersAndNumbers = /^[A-Za-z0-9 ]+$/;
 zipcodeRule = /^[0-9]{5}$/;
 phoneRule = /^[0-9]{10}$/;
  
 haulers = signal<any[]>([]);
 selectedHaulerId = '';
 selectedHaulerName = '';
 garbageDay1 = '';
 garbageDay2 = '';
 recyclingDay = '';
 recyclingFrequency = '';
 scheduleConfirmed = false;
 weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
 
 haulerError = '';
 garbageDay1Error = '';
 garbageDay2Error = '';
 recyclingDayError = '';
 recyclingFrequencyError = '';
 confirmError = '';

 emailAlerts = true; 

 constructor(private supabaseService: Supabase, private router: Router) {}

 async ngOnInit() {
   const client = this.supabaseService.getClient();
   const { data } = await client.auth.getSession();
   if (!data.session) {
    return;
   }
   this.userId = data.session.user.id;
   const { data: resident } = await client
     .from('residents')
     .select('*')
     .eq('user_id', this.userId)
     .maybeSingle();
   if(!resident) {
    this.step.set(1);
    return;
   }
   if (resident.onboarding_complete === true) {
    this.router.navigate(['/residentdashboard']);
    return;
   }
   this.fillFromResident(resident);
   if (resident.hauler_id) {
    await this.loadHaulers();
    for (const hauler of this.haulers()) {
     if (hauler.id === resident.hauler_id) {
      this.selectedHaulerName = hauler.name;
     }
    }
    this.step.set(4);
   } else {
    this.step.set(2);
    this.checkServiceArea();
   }
 } 

 fillFromResident(resident: any) {
  this.firstName = resident.first_name ?? '';
  this.lastName = resident.last_name ?? '';
  this.phone = resident.phone ?? '';
  this.ownerType = resident.owner_type ?? '';
  this.ageConfirmed = resident.age_confirmed ?? false;
  if (resident.address_text) {
   const parts = resident.address_text.split(', ');
   this.street = parts[0];
   this.town = parts[1];
   const stateAndZip = parts[2].split(' ');
   this.state = stateAndZip[0];
   this.zipcode = stateAndZip[1];
  }
  this.selectedHaulerId = resident.hauler_id ?? '';
  this.garbageDay1 = resident.garbage_day_1 ?? '';
  this.garbageDay2 = resident.garbage_day_2 ?? '';
  this.recyclingDay = resident.recycling_day ?? '';
  this.recyclingFrequency = resident.recycling_frequency ?? '';
  this.emailAlerts = resident.email_alerts ?? true;
 }

 async signInWithGoogle() {
  const client = this.supabaseService.getClient();
  await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/signup', queryParams: { prompt: 'select_account' } }
  });
 }

 async signInWithMicrosoft() {
  const client = this.supabaseService.getClient();
  await client.auth.signInWithOAuth({
    provider: 'azure',
    options: { scopes: 'email', redirectTo: window.location.origin + '/signup' }
  });
 }

 async createAccount() {
  this.errorMessage.set('');
  this.emailError = '';
  this.passwordError = '';
  let isValid = true;
  if (this.email.trim() === '') {
   this.emailError = 'Please enter your email.';
   isValid = false;
  }
  if (this.password === '') {
   this.passwordError = 'Please enter a password.';
   isValid = false;
  } else if (this.password.length < 6) {
   this.passwordError = 'Your password must be at least 6 characters.';
   isValid = false;
  }
  if (isValid === false) {
   return;
  }
  const client = this.supabaseService.getClient();
  const { data, error } = await client.auth.signUp({
    email: this.email,
    password: this.password
  }); 
  if (error || !data.user) {
    console.log(error);
    if (error && error.message.toLowerCase().includes('already registered')) {
     this.errorMessage.set('An account with this email already exists. Please sign in instead.');
    } else {
     this.errorMessage.set('We could not create your account. Please try again.');
    }
    return;
  }
  this.userId = data.user.id;
  this.step.set(1);
 }

 validateStep1() {
   this.firstNameError = '';
   this.lastNameError = '';
   this.streetError = '';
   this.townError = '';
   this.zipcodeError = '';
   this.phoneError = '';
   this.ownerTypeError = '';
   this.ageError = '';
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
   if (this.phone.trim() === '') {
    this.phoneError = 'Please enter your phone number.';
    isValid = false;
   } else if (!this.phoneRule.test(this.phone)) {
    this.phoneError = 'Phone number must be 10 numbers.';
    isValid = false;
   }
   if (this.ownerType === '') {
    this.ownerTypeError = 'Please select your home type.';
    isValid = false;
   }
   if (this.ageConfirmed === false) {
    this.ageError = 'You must confirm you are 18 or older.';
    isValid = false;
   }
   return isValid;
 }

 async saveStep1() {
  this.errorMessage.set('');
  if (this.validateStep1() === false) {
   return;
  }
  const client = this.supabaseService.getClient();
  const address = this.street + ', ' + this.town + ', ' + this.state + ' ' + this.zipcode;
  const residentInfo = {
   user_id: this.userId,
   first_name: this.firstName,
   last_name: this.lastName,
   address_text: address,
   phone: this.phone,
   owner_type: this.ownerType,
   age_confirmed: this.ageConfirmed
  };
  const { data: existing } = await client.from('residents').select('id').eq('user_id', this.userId);
  if (!existing || existing.length === 0) {
   const { error } = await client.from('residents').insert(residentInfo);
   if (error) {
    console.log(error);
    this.errorMessage.set('Something went wrong saving your information. Please try again.');
    return;
   }
  } else {
   const { error } = await client.from('residents').update(residentInfo).eq('user_id', this.userId);
   if (error) {
    console.log(error);
    this.errorMessage.set('Something went wrong saving your information. Please try again.');
    return;
   }
  }
  this.step.set(2);
  this.checkServiceArea();
 }

 async checkServiceArea() {
  this.errorMessage.set('');
  this.checking.set(true);
  this.inServiceArea.set(false);
  const client = this.supabaseService.getClient();
  const { data, error } = await client
    .from('service_area')
    .select('*')
    .ilike('town', this.town.trim())
    .ilike('state', this.state.trim())
    .eq('zipcode', this.zipcode.trim())
    .eq('active', true);
  this.checking.set(false);
  if (error) {
   console.log(error);
   this.errorMessage.set('We could not check your service area. Please try again.');
   return;
  }
  if (data.length > 0) {
   this.inServiceArea.set(true);
  }
 }
 saveStep2() {
  if (this.inServiceArea() === false) {
   return;
  }
  this.step.set(3);
  this.loadHaulers();
 }

 async loadHaulers() {
   const client = this.supabaseService.getClient();
   const { data, error } = await client.from('haulers').select('id, name');
   if (error) {
    console.log(error);
    this.errorMessage.set('We could not load the haulers. Please try again.');
    return;
   }
   if (data) {
    this.haulers.set(data);
   }
  }
  selectHauler(hauler: any) {
    this.errorMessage.set('');
    this.selectedHaulerId = hauler.id;
    this.selectedHaulerName = hauler.name;
    this.scheduleConfirmed = false;
    this.haulerError = '';
    this.garbageDay1Error = '';
    this.garbageDay2Error = '';
    this.recyclingDayError = '';
    this.recyclingFrequencyError = '';
    this.confirmError = '';
    if (hauler.name === 'X-Cel Carting') {
     this.garbageDay1 = 'Monday';
     this.garbageDay2 = 'Thursday';
     this.recyclingDay = 'Wednesday';
     this.recyclingFrequency = 'biweekly';
    } else {
     this.garbageDay1 = '';
     this.garbageDay2 = '';
     this.recyclingDay = '';
     this.recyclingFrequency = '';
    }
   }
   isXcel() {
    return this.selectedHaulerName === 'X-Cel Carting';
   }
   validateStep3() {
     this.haulerError = '';
     this.garbageDay1Error = '';
     this.garbageDay2Error = '';
     this.recyclingDayError = '';
     this.confirmError = '';
     let isValid = true;
     if (this.selectedHaulerId === '') {
      this.haulerError = 'Please select your hauler.';
      return false;
     }
     if (this.isXcel()) {
      if (this.scheduleConfirmed === false) {
       this.confirmError = 'Please confirm that this pickup schedule matches your service.';
       isValid = false;
      }
     } else {
      if (this.garbageDay1 === '') {
       this.garbageDay1Error = 'Please select a day.';
       isValid = false;
      }
      if (this.garbageDay2 !== '' && this.garbageDay2 === this.garbageDay1) {
        this.garbageDay2Error = 'Your second garbage day must be different from the first.';
        isValid = false;
      }
      if (this.recyclingDay === '') {
       this.recyclingDayError = 'Please select a day.';
       isValid = false;
      }
      if (this.recyclingFrequency === '') {
       this.recyclingFrequencyError = 'Please select the frequency.';
       isValid = false;
      }
     }
     return isValid;
   }

   async saveStep3() {
     this.errorMessage.set('');
     if (this.validateStep3() === false) {
       return;
     }
     const client = this.supabaseService.getClient();
     const { error } = await client
       .from('residents')
       .update({
         hauler_id: this.selectedHaulerId,
         garbage_day_1: this.garbageDay1,
         garbage_day_2: this.garbageDay2 === '' ? null : this.garbageDay2,
         recycling_day: this.recyclingDay,
         recycling_frequency: this.recyclingFrequency
       })
       .eq('user_id', this.userId);
     if (error) {
      console.log(error);
      this.errorMessage.set('Something went wrong saving your hauler and schedule. Please try again.');
      return;
     }
    this.step.set(4);
   } 
 
   async saveStep4() {
    this.errorMessage.set('');
    const client = this.supabaseService.getClient();
    const { error } = await client
      .from('residents')
      .update({ email_alerts: this.emailAlerts })
      .eq('user_id', this.userId);
    if (error) {
     console.log(error);
     this.errorMessage.set('Something went wrong saving your email preference. Please try again.');
     return;
    }
    this.step.set(5);
    this.checkSetup();
   }
 
  async checkSetup() {
   this.errorMessage.set('');
   this.setupComplete.set(false);
   const client = this.supabaseService.getClient();
   const { data, error } = await client
     .from('residents')
     .select('*')
     .eq('user_id', this.userId)
     .single();
   if (error || !data) {
    console.log(error);
    this.errorMessage.set('We could not confirm your information. Please try again.');
    return;
   }
   if (!data.first_name || !data.last_name || !data.address_text || !data.phone || !data.owner_type || !data.age_confirmed || !data.hauler_id || !data.garbage_day_1 || !data.recycling_day || !data.recycling_frequency) {
    this.errorMessage.set('Some of your information is missing. Please go back and complete each step.');
   return;
   }
   const { error: completeError } = await client
    .from('residents')
    .update({ onboarding_complete: true })
    .eq('user_id', this.userId);
   if (completeError) {
    console.log(completeError);
    this.errorMessage.set('We could not finish your setup. Please try again.');
    return;
   }
   this.setupComplete.set(true);
  }
  goToDashboard(){
   this.router.navigate(['/residentdashboard']);
  }

 goBack() {
  this.errorMessage.set('');
  this.step.set(this.step() - 1);
  if (this.step() === 2) {
   this.checkServiceArea();
  }
 }

 async backToAccount() {
  const goBack = confirm('Going back will sign you out. If you sign up with a different method, ' + 'you will need to enter your information again. Do you want to go back?');
  if (goBack === false) {
   return;
  }
  const client = this.supabaseService.getClient();
  await client.auth.signOut();
  this.userId = '';
  this.email = '';
  this.password = '';
  this.errorMessage.set('');
  this.step.set(0);
 }
}
