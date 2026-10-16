
 // Load environment variables from .env
require("dotenv").config();

// Import Supabase client
const { createClient } = require("@supabase/supabase-js");

// Number of remaining stops before a pickup is approaching
const APPROACHING_THRESHOLD = 5;

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

    if (i <= APPROACHING_THRESHOLD && pickups[i].status === "upcoming") {

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
    .select("id, hauler_id, truck_name")
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

    // Update the existing truck record in Supabase
    const { data, error } = await supabase
      .from("truck_positions")
      .update({
        lat: position.lat,
        lng: position.lng,
        current_route_order: pickup.route_order,
        current_collection_type: pickup.collection_type,
        updated_at: new Date().toISOString()
      })
      .eq("truck_id", truck.id)
      .select("id, lat, lng, current_route_order, current_collection_type, updated_at")
      .single();

    // Check whether the update succeeded
    if (error) {
      console.error("Truck update failed:", truck.truck_name, error.message);
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
    console.log("Latitude:", data.lat);
    console.log("Longitude:", data.lng);
    console.log("Updated at:", data.updated_at);

    // Move to the next scheculed pickup
    index++;
    //Stop after all scheduled pickups have been visited
    if (index >= pickups.length){
      console.log("All scheduled pickups have been visited for:", truck.truck_name);
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
  setTimeout(repeatMovement, 5000);
}
}

// Start repeating only if pickups remain
if (index < pickups.length) {
  setTimeout(repeatMovement, 5000);
}

}

// Start the simulator
startSimulator();
