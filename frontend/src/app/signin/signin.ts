import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-signin',
  styleUrl: './signin.css',
  templateUrl: './signin.html',
})
export class Signin {
 email = '';
 password = '';
 
 emailError = '';
 passwordError = '';
 errorMessage = signal('');
 signingIn = signal(false);

 constructor(private supabaseService: Supabase, private router: Router) {}
 
 async ngOnInit() { 
  const client = this.supabaseService.getClient();
  const { data } = await client.auth.getSession(); 
  if (data.session) {
   this.goToRightPage(data.session.user.id);
  }
 }
 
 async signIn() {
  this.emailError = '';
  this.passwordError = '';
  this.errorMessage.set('');
  let isValid = true;
  if (this.email.trim() === '') {
   this.emailError = 'Please enter your email.';
   isValid = false;
  }
  if (this.password === '') {
   this.passwordError = 'Please enter your password.';
   isValid = false;
  }
  if (isValid === false) {
   return;
  }
  this.signingIn.set(true);
  const client = this.supabaseService.getClient();
  const { data, error } = await client.auth.signInWithPassword({
   email: this.email.trim(),
   password: this.password
  });
  this.signingIn.set(false);
  if (error || !data.user) {
   console.log(error);
   this.errorMessage.set('Your email or password is incorrect. Please try again.');
   return;
  }
  this.goToRightPage(data.user.id);
 }
 
 async signInWithGoogle() {
  const client = this.supabaseService.getClient();
  await client.auth.signInWithOAuth({
   provider: 'google',
   options: {
    redirectTo: window.location.origin + '/signin',
    queryParams: { prompt: 'select_account' }
   }
  });
 }
 
 async signInWithMicrosoft() {
  const client = this.supabaseService.getClient();
  await client.auth.signInWithOAuth({
   provider: 'azure',
   options: {
    scopes: 'email',
    redirectTo: window.location.origin + '/signin',
    queryParams: { prompt: 'select_account' }
   }
  });
 }

 async goToRightPage(userId: string) {
  const client = this.supabaseService.getClient();
  const { data: resident } = await client
   .from('residents')
   .select('onboarding_complete')
   .eq('user_id', userId)
   .maybeSingle();
  if (resident && resident.onboarding_complete === true) {
   this.router.navigate(['/residentdashboard']);
  } else {
   this.router.navigate(['/signup']);
  }
 }
}
