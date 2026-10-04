import { Routes } from '@angular/router';
import { Home } from './home/home';
import { About } from './about/about';
import { Purpose } from './purpose/purpose';
import { Contact } from './contact/contact';
import { Signin } from './signin/signin';
import { Signup } from './signup/signup';
import { Privacy } from './privacy/privacy';

export const routes: Routes = [
 { path: '', component: Home },
 { path: 'about', component: About },
 { path: 'purpose', component: Purpose },
 { path: 'contact', component: Contact },
 { path: 'signin', component: Signin },
 { path: 'signup', component: Signup },
 { path: 'privacy', component: Privacy }, 
];
