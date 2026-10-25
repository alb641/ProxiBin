import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Supabase } from '../services/supabase';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-contact',
  styleUrl: './contact.css',
  templateUrl: './contact.html',
})
export class Contact {
 name = '';
 email = '';
 inquiryType = '';
 message = '';

 nameError = '';
 emailError = '';
 inquiryTypeError = '';
 messageError = '';

 sentMessage = signal('');
 errorMessage = signal('');
 sending = signal(false); 

 inquiryTypes = [
  'Resident Support',
  'Waste Hauler Partnership',
  'Municipality/Community Inquiry',
  'Product Feedback',
  'Report a Problem',
  'General Inquiry'
 ];

 lettersOnly = /^[A-Za-z ]+$/;
 emailRule = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

 constructor(private supabaseService: Supabase) {} 

 validateForm() {
  this.nameError = '';
  this.emailError = '';
  this.inquiryTypeError = '';
  this.messageError = '';
  let isValid = true;
  if (this.name.trim() === '') {
   this.nameError = 'Please enter your name.';
   isValid = false;
  } else if (!this.lettersOnly.test(this.name)) {
   this.nameError = 'Name can only contain letters.';
  isValid = false;
  }
  if (this.email.trim() === '') {
   this.emailError = 'Please enter your email.';
   isValid = false;
  } else if (!this.emailRule.test(this.email.trim())) {
   this.emailError = 'Please enter a valid email address.';
   isValid = false;
  }
  if (this.inquiryType === '') {
   this.inquiryTypeError = 'Please select an inquiry type.';
   isValid = false;
 }
  if (this.message.trim() === '') {
   this.messageError = 'Please enter a message.';
   isValid = false;
  } else if (this.message.trim().length < 10) {
   this.messageError = 'Your message must be at least 10 characters.';
   isValid = false;
  }
  return isValid;
 }
 
 async sendInquiry() {
  this.sentMessage.set('');
  this.errorMessage.set('');
  if (this.validateForm() === false) {
   return;
  }
  this.sending.set(true);
  const client = this.supabaseService.getClient();
  const { error } = await client.from('inquiries').insert({
   name: this.name.trim(),
   email: this.email.trim(),
   inquiry_type: this.inquiryType,
   message: this.message.trim()
  });
  this.sending.set(false);
  if (error) {
   console.log(error); 
   this.errorMessage.set('Something went wrong sending your message. Please try again.');
   return;
  }
  this.sentMessage.set('Thanks for reaching out! Your message has been sent and our team will get back to you soon.');
  this.name = '';
  this.email = '';
  this.inquiryType = '';
  this.message = '';
 }
}
