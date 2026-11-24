import { Routes } from '@angular/router';
import { Home } from './home/home';
import { About } from './about/about';
import { Purpose } from './purpose/purpose';
import { Contact } from './contact/contact';
import { Signin } from './signin/signin';
import { Signup } from './signup/signup';
import { Privacy } from './privacy/privacy';
import { Residentdashboard } from './residentdashboard/residentdashboard';
import { Proxibinadmin } from './proxibinadmin/proxibinadmin';
import { residentGuard } from './residentguard';
import { Profile } from './profile/profile';
import { adminGuard } from './adminguard';
import { Admintickets } from './admintickets/admintickets';
import { Adminresidents } from './adminresidents/adminresidents';
import { Adminproviders } from './adminproviders/adminproviders';
import { Adminreports } from './adminreports/adminreports';

export const routes: Routes = [
 { path: '', component: Home },
 { path: 'about', component: About },
 { path: 'purpose', component: Purpose },
 { path: 'contact', component: Contact },
 { path: 'signin', component: Signin },
 { path: 'signup', component: Signup },
 { path: 'privacy', component: Privacy }, 
 { path: 'residentdashboard', component: Residentdashboard, canActivate: [residentGuard] },
 { path: 'proxibinadmin', component: Proxibinadmin, canActivate: [adminGuard] },
 { path: 'profile', component: Profile, canActivate: [residentGuard] },
 { path: 'proxibinadmin/tickets', component: Admintickets, canActivate: [adminGuard] },
 { path: 'proxibinadmin/residents', component: Adminresidents, canActivate: [adminGuard] },
 { path: 'proxibinadmin/providers', component: Adminproviders, canActivate: [adminGuard] },
 { path: 'proxibinadmin/reports', component: Adminreports, canActivate: [adminGuard] },
];
