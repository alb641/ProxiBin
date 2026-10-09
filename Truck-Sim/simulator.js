// Load environment variables from .env
require("dotenv").config();

// Import Supabase client
const { createClient } = require("@supabase/supabase-js");

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Get the truck ID from .env
const truckId = process.env.TRUCK_ID;

// Simulated coordinates around Watchung, NJ
// These are test locations, not official truck routes
const coordinates = [
  { lat: 40.6420, lng: -74.4410 },
  { lat: 40.6430, lng: -74.4390 },
  { lat: 40.6450, lng: -74.4370 },
  { lat: 40.6470, lng: -74.4350 },
  { lat: 40.6490, lng: -74.4330 }
];

// Main function responsible for truck movement
async function startSimulator() {

  // Retrieve collection sections from Supabase
  // Sort sections according to their collection order
  const { data: sections, error } = await supabase
    .from("sections")
    .select("id, name, order_index")
    .order("order_index", { ascending: true });

  // Stop if sections cannot be retrieved
  if (error) {
    console.error("Error loading sections:", error.message);
    return;
  }

  // Stop if no sections exist
  if (!sections || sections.length === 0) {
    console.log("No collection sections found.");
    return;
  }

  // Verify the truck ID was provided
  if (!truckId) {
    console.error("TRUCK_ID is missing from .env");
    return;
  }

  // Check that the truck exists before starting
  const { data: truck, error: truckError } = await supabase
    .from("truck_positions")
    .select("id")
    .eq("id", truckId)
    .single();

  if (truckError || !truck) {
    console.error("Truck not found:", truckError?.message);
    return;
  }

  console.log("Truck simulator started!");
  console.log("Sections loaded:", sections.length);

  // Track which section the truck is visiting
  let index = 0;

  // Function that updates the truck's position
  async function moveTruck() {

    // Get the current section
    const section = sections[index];

    // Get simulated coordinates for this section
    const position = coordinates[index % coordinates.length];

    // Update the existing truck record in Supabase
    const { data, error } = await supabase
      .from("truck_positions")
      .update({
        lat: position.lat,
        lng: position.lng,
        current_section_id: section.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", truckId)
      .select("id, lat, lng, current_section_id, updated_at")
      .single();

    // Check whether the update succeeded
    if (error) {
      console.error("Truck update failed:", error.message);
      return;
    }

    // Display the successful movement
    console.log("----------------------------");
    console.log("Truck moved to:", section.name);
    console.log("Latitude:", data.lat);
    console.log("Longitude:", data.lng);
    console.log("Updated at:", data.updated_at);

    // Move to the next section
    // Return to the first section after the last one
    index = (index + 1) % sections.length;
  }

  // Move immediately when the simulator starts
  await moveTruck();

  // Continue moving every 4 seconds
  // Wait for each update to finish before scheduling the next
  async function repeatMovement() {
    await moveTruck();
    setTimeout(repeatMovement, 4000);
  }

  setTimeout(repeatMovement, 4000);
}

// Start the simulator
startSimulator();