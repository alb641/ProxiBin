import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Supabase } from './services/supabase';

export const residentGuard = async () => {
 const supabaseService = inject(Supabase);
 const router = inject(Router);
 const client = supabaseService.getClient();
 const { data } = await client.auth.getSession();
 
 if (!data.session) {
  return router.createUrlTree(['/signin']);
 }
 
 const { data: resident } = await client
  .from('residents')
  .select('onboarding_complete')
  .eq('user_id', data.session.user.id)
  .maybeSingle();
 
 if (!resident || resident.onboarding_complete !== true) {
  return router.createUrlTree(['/signup']);
 }
 return true;
};
