require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const DAYS_AHEAD = 14;
const TZ = 'America/New_York';
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function isoDate(d) { return d.toISOString().slice(0,10); }
function parseDate(s) { return new Date(`${s}T12:00:00Z`); }
function addDays(s,n) { const d=parseDate(s); d.setUTCDate(d.getUTCDate()+n); return isoDate(d); }
function weekday(s) { return WEEKDAYS[parseDate(s).getUTCDay()]; }
function todayNY() { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const v=Object.fromEntries(parts.map(p=>[p.type,p.value])); return `${v.year}-${v.month}-${v.day}`; }
function assertOk(result,context) { if(result.error) throw new Error(`${context}: ${result.error.message}`); return result.data; }
async function allRows(table,columns,filters=[]) {
  let rows=[];
  for(let from=0;;from+=1000) {
    let q=supabase.from(table).select(columns).range(from,from+999);
    for(const [field,value] of filters) q=q.eq(field,value);
    const batch=assertOk(await q,`Read ${table}`)||[];
    rows.push(...batch);
    if(batch.length<1000) return rows;
  }
}

function due(resident, date) {
  return [
    resident.garbage_day_1,
    resident.garbage_day_2
  ].includes(weekday(date));
}

function key(...parts) { return parts.join('|'); }
async function main() {
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
  const start = process.env.SCHEDULE_START_DATE || addDays(todayNY(), 1);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || isoDate(parseDate(start))!==start) throw new Error('Invalid SCHEDULE_START_DATE');
  console.log(`${DRY_RUN?'DRY RUN':'SCHEDULING'} ${start} through ${addDays(start,DAYS_AHEAD-1)}`);
  const [residents,trucks,progress,runs]=await Promise.all([
    allRows('residents','id,hauler_id,lat,lng,garbage_day_1,garbage_day_2'),
    allRows('trucks','id,hauler_id,truck_name,is_active'),
    allRows('collection_progress','id,resident_id,truck_id,collection_type,schedule_date,route_order,collection_run_id,status'),
    allRows('collection_runs','id,truck_id,collection_type,schedule_date,status')
  ]);
  const activeByHauler=new Map();
  for(const t of trucks.filter(t=>t.is_active)) {
    if(!activeByHauler.has(t.hauler_id)) activeByHauler.set(t.hauler_id,[]);
    activeByHauler.get(t.hauler_id).push(t);
  }
  const existing=new Set(progress.map(p=>key(p.resident_id,p.collection_type,p.schedule_date)));
  const grouped=new Map();
  for(let i=0;i<DAYS_AHEAD;i++) {
    const date=addDays(start,i);
    for(const resident of residents) {
      for(const type of ['garbage']) {
        if(!due(resident,date) || existing.has(key(resident.id,type,date))) continue;
        if(resident.lat==null || resident.lng==null) { console.warn(`Skip ${resident.id}: missing coordinates`); continue; }
        const assigned=activeByHauler.get(resident.hauler_id)||[];
        if(assigned.length!==1) { console.warn(`Skip ${resident.id}: expected one active truck for hauler, got ${assigned.length}`); continue; }
        const truck=assigned[0];
        const groupKey=key(truck.id,type,date);
        if(!grouped.has(groupKey)) grouped.set(groupKey,{truck,type,date,residents:[]});
        grouped.get(groupKey).residents.push(resident);
      }
    }
  }
  let inserted=0,skipped=0;
  for(const group of grouped.values()) {
    const {truck,type,date}=group;
    const matchingRuns=runs.filter(r=>r.truck_id===truck.id && r.collection_type===type && r.schedule_date===date);
    if(matchingRuns.length>1) { console.warn(`Skip ${truck.truck_name} ${type} ${date}: duplicate runs`); skipped+=group.residents.length; continue; }
    if(matchingRuns.length && matchingRuns[0].status!=='scheduled') { console.warn(`Skip closed/in-progress run ${truck.truck_name} ${type} ${date}`); skipped+=group.residents.length; continue; }
    const run=matchingRuns[0];
    const current=progress.filter(p=>p.truck_id===truck.id && p.collection_type===type && p.schedule_date===date);
    // Don't extend a route already underway or completed, even if the run status is stale.
    if(current.some(p=>p.status!=='upcoming')) { console.warn(`Skip started route ${truck.truck_name} ${type} ${date}`); skipped+=group.residents.length; continue; }
    if(current.some(p=>p.collection_run_id!==run?.id)) { console.warn(`Skip inconsistent run assignments ${truck.truck_name} ${type} ${date}`); skipped+=group.residents.length; continue; }
    const ordered=[...group.residents].sort((a,b)=>a.id.localeCompare(b.id));
    let order=Math.max(0,...current.map(p=>p.route_order||0));
    console.log(`${truck.truck_name} ${type} ${date}: ${ordered.length} new pickups`);
    if(DRY_RUN) { inserted+=ordered.length; continue; }
    let runId=run?.id;
    if (!runId) {
  const { data, error } = await supabase
    .from('collection_runs')
    .upsert(
      {
        truck_id: truck.id,
        collection_type: type,
        schedule_date: date,
        status: 'scheduled',
        run_name: `${truck.truck_name} ${type} ${date}`
      },
      {
        onConflict: 'truck_id,collection_type,schedule_date',
        ignoreDuplicates: true
      }
    )
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Create collection run: ${error.message}`);
  }

  if (data) {
    runId = data.id;
  } else {
    const { data: existingRun, error: lookupError } = await supabase
      .from('collection_runs')
      .select('id,status')
      .eq('truck_id', truck.id)
      .eq('collection_type', type)
      .eq('schedule_date', date)
      .single();

    if (lookupError) {
      throw new Error(`Find existing run: ${lookupError.message}`);
    }

    if (existingRun.status !== 'scheduled') {
      throw new Error(`Collection run is already ${existingRun.status}`);
    }

    runId = existingRun.id;
  }
}
    for(const resident of ordered) {
      const row={resident_id:resident.id,truck_id:truck.id,collection_type:type,schedule_date:date,route_order:++order,status:'upcoming',collection_run_id:runId};
      const {error}=await supabase.from('collection_progress').insert(row);
      if(error) {
        if(error.code==='23505') { console.log(`Already scheduled: ${resident.id} ${type} ${date}`); skipped++; }
        else throw new Error(`Insert pickup ${resident.id}: ${error.message}`);
      } else inserted++;
    }
  }
  console.log(`${DRY_RUN?'Would create':'Created'} ${inserted} pickups; skipped ${skipped}.`);
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
