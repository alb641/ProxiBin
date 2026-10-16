
 // Load environment variables from .env
require("dotenv").config();

// Import Supabase client
const { createClient } = require("@supabase/supabase-js");

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


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

  // Start movement for each truck
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
  .select("id, resident_id, route_order, collection_type, schedule_date, status")
  .eq("truck_id", truck.id)
  .eq("schedule_date", process.env.SIM_DATE ||new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York"
}))
  .neq("status", "completed")
  .order("collection_type", { ascending: true })
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
        current_section_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("truck_id", truck.id)
      .select("id, lat, lng, updated_at")
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
  setTimeout(repeatMovement, 4000);
}
}

// Start repeating only if pickups remain
if (index < pickups.length) {
  setTimeout(repeatMovement, 4000);
}

}

// Start the simulator
startSimulator();
