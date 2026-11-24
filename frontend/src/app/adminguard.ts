import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Supabase } from './services/supabase';

export const adminGuard = async () => {
 const supabaseService = inject(Supabase);
 const router = inject(Router);
 const client = supabaseService.getClient();
 const { data } = await client.auth.getSession();

 if (!data.session) {
  return router.createUrlTree(['/signin']);
 }

 const { data: admin } = await client
  .from('admins')
  .select('id')
  .eq('user_id', data.session.user.id)
  .maybeSingle();

 if (!admin) {
  return router.createUrlTree(['/residentdashboard']);
 }
 return true;
};
