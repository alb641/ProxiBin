
 // Load environment variables from .env
require("dotenv").config();

// Import Supabase client
const { createClient } = require("@supabase/supabase-js");

// Number of remaining stops before a pickup is approaching
const APPROACHING_THRESHOLD = 5

const DRY_RUN = process.argv.includes("--dry-run");

// Simulated driving settings
const TRAVEL_TIME_MS = 10000;
const POSITION_UPDATE_MS = 2000;
const STEPS_PER_TRIP = TRAVEL_TIME_MS / POSITION_UPDATE_MS;

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Get the driving route between two locations using Mapbox
async function getDrivingRoute(start, end) {
  const coordinates =
    `${start.lng},${start.lat};${end.lng},${end.lat}`;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}` +
    `?geometries=geojson&overview=full` +
    `&access_token=${process.env.MAPBOX_TOKEN}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Mapbox request failed: ${response.status}`);
    }

    const result = await response.json();
    const route = result.routes?.[0]?.geometry?.coordinates;

    if (!route || route.length < 2) {
      throw new Error("No valid driving route found.");
    }

    return route.map(([lng, lat]) => ({ lat, lng }));

  } catch (error) {
    console.error("Mapbox route error:", error.message);
    return null;
  }
}

 // Calculate the most efficient pickup order using Mapbox
async function optimizeRoute(start, pickups) {
  if (pickups.length > 11) {
    throw new Error("Mapbox supports up to 11 pickups plus depot.");
  }

  const coordinates = [
    start,
    ...pickups.map(p => ({
      lat: p.resident.lat,
      lng: p.resident.lng
    }))
  ];

  const coordinateString = coordinates
    .map(p => `${p.lng},${p.lat}`)
    .join(";");

  const url =
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}` +
    `?roundtrip=true&source=first&destination=any` +
    `&access_token=${process.env.MAPBOX_TOKEN}`;

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok || result.code !== "Ok") {
    throw new Error(result.message || "Route optimization failed");
  }

  if (!result.waypoints ||
      result.waypoints.length !== coordinates.length) {
    throw new Error("Invalid optimization response");
  }

  return pickups
    .map((pickup, index) => ({
      ...pickup,
      optimizedOrder: result.waypoints[index + 1].waypoint_index
    }))
    .sort((a, b) => a.optimizedOrder - b.optimizedOrder);
}

// Simulate driving along a road route
async function driveToStop(truck, start, destination, pickup) {
  const route = await getDrivingRoute(start, destination);

  if (!route) {
    console.error("Cannot drive without a valid road route.");
    return false;
  }

  // Calculate distances along the road
  const distances = [0];

  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];

    const dx = (b.lng - a.lng) *
      Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    const dy = b.lat - a.lat;

    distances.push(
      distances[i - 1] + Math.sqrt(dx * dx + dy * dy)
    );
  }

  const totalDistance = distances[distances.length - 1];

  if (totalDistance === 0) {
    console.error("Route has no travel distance.");
    return false;
  }

  // Five position updates over approximately 10 seconds
  for (let step = 1; step <= STEPS_PER_TRIP; step++) {
    await new Promise(resolve =>
      setTimeout(resolve, POSITION_UPDATE_MS)
    );

    // Stop if the truck has been deactivated
    const { data: activeTruck, error: activeError } = await supabase
      .from("trucks")
      .select("is_active")
      .eq("id", truck.id)
      .single();

    if (activeError || !activeTruck || !activeTruck.is_active) {
      console.error("Truck inactive or unavailable:", truck.truck_name);
      return false;
    }

    const targetDistance = totalDistance * step / STEPS_PER_TRIP;

    let segment = 1;

    while (
      segment < distances.length - 1 &&
      distances[segment] < targetDistance
    ) {
      segment++;
    }

    const segmentDistance =
      distances[segment] - distances[segment - 1];

    const fraction = segmentDistance === 0
      ? 0
      : (targetDistance - distances[segment - 1]) / segmentDistance;

    const a = route[segment - 1];
    const b = route[segment];

    const lat = a.lat + (b.lat - a.lat) * fraction;
    const lng = a.lng + (b.lng - a.lng) * fraction;

    const { data, error } = await supabase
      .from("truck_positions")
      .update({
        lat,
        lng,
        current_route_order: pickup.route_order,
        current_collection_type: pickup.collection_type,
        updated_at: new Date().toISOString()
      })
      .eq("truck_id", truck.id)
      .select("id")
      .single();

    if (error || !data) {
      console.error(
        "Truck position update failed:",
        error?.message || "No matching truck position"
      );
      return false;
    }

    console.log(
      `${truck.truck_name}: driving update ${step}/${STEPS_PER_TRIP}`
    );
  }

  return true;
}

// Update approaching statuses within a single collection run
async function updateApproachingStatuses(truckId, runId) {

  // Load unfinished pickups for this truck and run
  const { data: pickups, error } = await supabase
    .from("collection_progress")
    .select("id, route_order, status")
    .eq("truck_id", truckId)
    .eq("collection_run_id", runId)
    .neq("status", "completed")
    .order("route_order", { ascending: true });

  if (error) {
    console.error("Error checking approaching pickups:", error.message);
    return false;
  }

  // Update pickups that have five or fewer unfinished stops before them
  for (let i = 0; i < pickups.length; i++) {

    if (i < APPROACHING_THRESHOLD && pickups[i].status === "upcoming") {

      const { error: updateError } = await supabase
        .from("collection_progress")
        .update({ status: "approaching" })
        .eq("id", pickups[i].id)
        .eq("truck_id", truckId)
        .eq("collection_run_id", runId)
        .eq("status", "upcoming");

      if (updateError) {
        console.error("Error updating approaching status:", updateError.message);
        return false;
      }
    }
  }

  return true;
}

// Main function responsible for truck movement
async function startSimulator() {

  // Retrieve all active trucks from Supabase
  const { data: trucks, error: truckError } = await supabase
  .from("trucks")
  .select("id, hauler_id, truck_name, start_lat, start_lng")
  .eq("is_active", true);

  if (truckError) {
    console.error("Error loading trucks:", truckError.message);
    return;
  }

  if (!trucks || trucks.length === 0) {
    console.log("No active trucks found.");
    return;
  }

  console.log("Truck simulator started!");
  console.log("Active trucks:", trucks.length);

  //Start movement for each truck
  for (const truck of trucks) {
    simulateTruck(truck);
  }
}


// Function responsible for moving each truck
async function simulateTruck(truck) {

  // Retrieve collection sections from Supabase
  // Sort sections according to their collection order
 // Retrieve scheduled pickups for this truck
const { data: pickups, error } = await supabase
  .from("collection_progress")
  .select("id, resident_id, route_order, collection_type, schedule_date, collection_run_id, status")
  .eq("truck_id", truck.id)
  .eq("collection_type", "garbage")
  .eq("schedule_date", process.env.SIM_DATE ||new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York"
}))
  .neq("status", "completed")
  .order("collection_run_id", { ascending: true })
  .order("route_order", { ascending: true });

  // Stop if sections cannot be retrieved
 // Stop if pickups cannot be retrieved
if (error) {
  console.error("Error loading pickups:", error.message);
  return;
}



// Stop if no scheduled pickups exist
if (!pickups || pickups.length === 0) {
  console.log("No scheduled pickups found for:", truck.truck_name);
  return;
}


  // Load resident coordinates for route optimization
  const { data: residents, error: residentsError } = await supabase
    .from("residents")
    .select("id, first_name, last_name, lat, lng")
    .in("id", [...new Set(pickups.map(p => p.resident_id))]);

  if (residentsError) {
    console.error("Error loading residents:", residentsError.message);
    return;
  }

  const residentMap = new Map(residents.map(r => [r.id, r]));

  for (const pickup of pickups) {
    pickup.resident = residentMap.get(pickup.resident_id);

    if (!pickup.resident ||
        !Number.isFinite(Number(pickup.resident.lat)) ||
        !Number.isFinite(Number(pickup.resident.lng))) {
      console.error("Missing resident coordinates:", pickup.resident_id);
      return;
    }
  }

  // Group pickups by collection run
  const runGroups = new Map();

  for (const pickup of pickups) {
    if (!pickup.collection_run_id) {
      console.error("Pickup is missing a collection run ID.");
      return;
    }

    if (!runGroups.has(pickup.collection_run_id)) {
      runGroups.set(pickup.collection_run_id, []);
    }

    runGroups.get(pickup.collection_run_id).push(pickup);
  }

  const plannedPickups = [];

  for (const [runId, runPickups] of runGroups) {
    const { data: run, error: runError } = await supabase
      .from("collection_runs")
      .select("status")
      .eq("id", runId)
      .eq("truck_id", truck.id)
      .single();

    if (runError || !run) {
      console.error("Cannot load collection run:", runId);
      return;
    }

    // Do not change the order of a route already in progress
    if (run.status !== "scheduled") {
      plannedPickups.push(...runPickups);
      continue;
    }

    const depot = {
      lat: truck.start_lat,
      lng: truck.start_lng
    };

    if (!Number.isFinite(Number(depot.lat)) ||
        !Number.isFinite(Number(depot.lng))) {
      console.error("Truck has no valid depot coordinates:", truck.truck_name);
      return;
    }

    let optimized;

    try {
      optimized = await optimizeRoute(depot, runPickups);
    } catch (error) {
      console.error("Optimization failed:", error.message);
      return;
    }

    console.log("Optimized route for:", truck.truck_name);

    console.table(optimized.map((p, i) => ({
      resident: `${p.resident.first_name} ${p.resident.last_name}`,
      oldOrder: p.route_order,
      newOrder: i + 1
    })));

    if (!DRY_RUN) {
      // Use temporary order numbers to avoid uniqueness conflicts
      const temporaryBase =
        Math.max(1000000, ...runPickups.map(p => p.route_order || 0)) + 100;

      for (let i = 0; i < optimized.length; i++) {
        const { error } = await supabase
          .from("collection_progress")
          .update({ route_order: temporaryBase + i })
          .eq("id", optimized[i].id)
          .eq("collection_run_id", runId);

        if (error) {
          console.error("Temporary route update failed:", error.message);
          return;
        }
      }

      for (let i = 0; i < optimized.length; i++) {
        const { error } = await supabase
          .from("collection_progress")
          .update({ route_order: i + 1 })
          .eq("id", optimized[i].id)
          .eq("collection_run_id", runId);

        if (error) {
          console.error("Route update failed:", error.message);
          return;
        }

        optimized[i].route_order = i + 1;
      }
    }

    plannedPickups.push(...optimized);
  }

  if (DRY_RUN) {
    console.log("DRY RUN: No database changes or truck movement.");
    return;
  }

  // Use the optimized pickup sequence for movement
  pickups.splice(0, pickups.length, ...plannedPickups);


console.log("Truck:", truck.truck_name);
console.log("Pickups loaded:", pickups.length);

  // Track which section the truck is visiting
  let index = 0;

  // Function that updates the truck's position
  async function moveTruck() {

// Get the current scheduled pickup
const pickup = pickups[index];

// Check if the truck is starting a different collection run
if (
  index > 0 &&
  pickup.collection_run_id !== pickups[index - 1].collection_run_id
) {
  const nextRunUpdated = await updateApproachingStatuses(
    truck.id,
    pickup.collection_run_id
  );

  if (!nextRunUpdated) {
    console.error("Could not update the next collection run.");
    return false;
  }
  
const { error: nextRunError } = await supabase
  .from("collection_runs")
  .update({ status: "in_progress" })
  .eq("id", pickup.collection_run_id)
  .eq("truck_id", truck.id)
  .eq("status", "scheduled");

if (nextRunError) {
  console.error("Could not start next collection run:", nextRunError.message);
  return false;
}

  console.log("Starting next collection run:", pickup.collection_run_id);
}

// Check whether this truck is still active
const { data: activeTruck, error: activeError } = await supabase
  .from("trucks")
  .select("is_active")
  .eq("id", truck.id)
  .single();

// Stop movement if the truck is inactive or cannot be checked
if (activeError || !activeTruck || activeTruck.is_active !== true) {
  console.log("Truck is inactive or unavailable:", truck.truck_name);
  return false;
}

// Get the resident assigned to this pickup
const { data: resident, error: residentError } = await supabase
  .from("residents")
  .select("first_name, last_name, lat, lng")
  .eq("id", pickup.resident_id)
  .single();

// Stop if the resident cannot be retrieved
if (residentError || !resident) {
  console.error(
    "Error loading resident:",
    residentError?.message || "Resident not found"
  );
  return false;
}

// Stop if the resident has no coordinates
if (resident.lat == null || resident.lng == null) {
  console.error("Missing coordinates for resident:", pickup.resident_id);
  return false;
}

// Use the resident coordinates from Supabase
const position = {
  lat: resident.lat,
  lng: resident.lng
};

// Get the truck's current location
const { data: currentPosition, error: positionError } = await supabase
  .from("truck_positions")
  .select("lat, lng")
  .eq("truck_id", truck.id)
  .single();

if (positionError || !currentPosition) {
  console.error("Could not load truck starting position:", truck.truck_name);
  return false;
}

if (currentPosition.lat == null || currentPosition.lng == null) {
  console.error("Truck has no starting coordinates:", truck.truck_name);
  return false;
}

// Drive along the road before completing the pickup
const arrived = await driveToStop(
  truck,
  { lat: currentPosition.lat, lng: currentPosition.lng },
  position,
  pickup
);


if (!arrived) {
  console.error("Truck could not reach pickup:", truck.truck_name);
  return false;
}


// Check again before completing the pickup
const { data: truckStatus, error: statusError } = await supabase
  .from("trucks")
  .select("is_active")
  .eq("id", truck.id)
  .single();

// Do not complete the pickup if the truck was deactivated
if (statusError || !truckStatus || truckStatus.is_active !== true) {
  console.log("Truck deactivated before pickup completion:", truck.truck_name);
  return false;
}    
    // Mark the scheduled pickup as completed
const { error: completionError } = await supabase
  .from("collection_progress")
  .update({
    status: "completed",
    completed_at: new Date().toISOString()
  })
  .eq("id", pickup.id)
  .eq("truck_id", truck.id)
  .neq("status", "completed")
  .select("id")
  .single();

// Stop if the pickup could not be marked completed
if (completionError) {
  console.error("Pickup completion failed:", completionError.message);
  return false;
}

// Mark the collection run as in progress
const { error: runError } = await supabase
  .from("collection_runs")
  .update({ status: "in_progress" })
  .eq("id", pickup.collection_run_id)
  .eq("truck_id", truck.id)
  .eq("status", "scheduled");

if (runError) {
  console.error("Error updating collection run:", runError.message);
  return false;
}

// Update approaching statuses after completing this pickup
const approachingUpdated = await updateApproachingStatuses(
  truck.id,
  pickup.collection_run_id
);

if (!approachingUpdated) {
  console.error("Failed to update approaching statuses.");
  return false;
}

// Check whether any unfinished pickups remain in this collection run
const { count: remainingPickups, error: countError } = await supabase
  .from("collection_progress")
  .select("id", { count: "exact", head: true })
  .eq("truck_id", truck.id)
  .eq("collection_run_id", pickup.collection_run_id)
  .neq("status", "completed");

if (countError) {
  console.error("Error checking remaining pickups:", countError.message);
  return false;
}

// Mark the collection run as completed when all pickups are finished
if (remainingPickups === 0) {
  const { error: completedRunError } = await supabase
    .from("collection_runs")
    .update({ status: "completed" })
    .eq("id", pickup.collection_run_id)
    .eq("truck_id", truck.id)
    .eq("status", "in_progress");

  if (completedRunError) {
    console.error("Error completing collection run:", completedRunError.message);
    return false;
  }

  console.log("Collection run completed:", pickup.collection_run_id);
}

    // Display the successful movement
    console.log("----------------------------");
    console.log("Truck:", truck.truck_name);
    console.log("Truck moved to:", resident.first_name, resident.last_name);
    console.log("Collection Type:", pickup.collection_type);
    console.log("Route order:", pickup.route_order);
    console.log("Latitude:", position.lat);
    console.log("Longitude:", position.lng);
    console.log("Arrived at:", new Date().toISOString());

    // Move to the next scheculed pickup
   
    index++;

    if (index >= pickups.length) {
      console.log("All pickups completed for:", truck.truck_name);

      const depot = {
        lat: truck.start_lat,
        lng: truck.start_lng
      };

      const { data: lastPosition, error: lastPositionError } = await supabase
        .from("truck_positions")
        .select("lat, lng")
        .eq("truck_id", truck.id)
        .single();

      if (lastPositionError || !lastPosition) {
        console.error("Could not load truck position for depot return.");
        return false;
      }

      console.log("Returning to depot:", truck.truck_name);

      const returned = await driveToStop(
        truck,
        { lat: lastPosition.lat, lng: lastPosition.lng },
        depot,
        pickup
      );

      if (!returned) {
        console.error("Truck could not return to depot.");
        return false;
      }

      console.log("Truck returned to depot:", truck.truck_name);
    }

  }

  // Update approaching statuses for the first collection run only
const firstRunId = pickups[0].collection_run_id;

if (!firstRunId) {
  console.error("Pickup is missing a collection run ID.");
  return;
}

const updated = await updateApproachingStatuses(truck.id, firstRunId);

if (!updated) {
  console.error("Could not update approaching statuses.");
  return;
}


  // Initialize the truck at its depot for a new run
  const { data: firstRun, error: firstRunError } = await supabase
    .from("collection_runs")
    .select("status")
    .eq("id", firstRunId)
    .eq("truck_id", truck.id)
    .single();

  if (firstRunError || !firstRun) {
    console.error("Could not check starting run status.");
    return;
  }

  if (firstRun.status === "scheduled") {
    const { data, error: resetError } = await supabase
      .from("truck_positions")
      .update({
        lat: truck.start_lat,
        lng: truck.start_lng,
        updated_at: new Date().toISOString()
      })
      .eq("truck_id", truck.id)
      .select("id")
      .single();

    if (resetError || !data) {
      console.error("Could not initialize truck at depot.");
      return;
    }

    console.log("Truck starting at depot:", truck.truck_name);
  }

  
  // Mark the collection run as started before movement
  if (firstRun.status === "scheduled") {
    const { data: startedRun, error: startError } = await supabase
      .from("collection_runs")
      .update({ status: "in_progress" })
      .eq("id", firstRunId)
      .eq("truck_id", truck.id)
      .eq("status", "scheduled")
      .select("id")
      .single();

    if (startError || !startedRun) {
      console.error("Could not start collection run:", startError?.message);
      return;
    }

    console.log("Collection run started:", firstRunId);
  }

// Move immediately when the simulator starts
const firstMove = await moveTruck();

// Stop if the truck is inactive or movement failed
if (firstMove === false) {
  return;
}

// Continue moving every 4 seconds
// Wait for each update to finish before scheduling the next
async function repeatMovement() {

  // Stop when all scheduled pickups have been visited
  if (index >= pickups.length) {
    return;
  }

 const moved = await moveTruck();

// Stop repeating if the truck is inactive or movement failed
if (moved === false) {
  return;
}

// Schedule another movement only if pickups remain
if (index < pickups.length) {
  setTimeout(repeatMovement, 0);
}
}

// Start repeating only if pickups remain
if (index < pickups.length) {
  setTimeout(repeatMovement, 0);
}

}

// Start the simulator
startSimulator();
