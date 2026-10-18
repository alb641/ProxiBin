require("dotenv").config();

async function testMapbox() {
  const start = [-74.4450, 40.6400];
  const end = [-74.4390, 40.6430];

  const coordinates = `${start.join(",")};${end.join(",")}`;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}` +
    `?geometries=geojson&overview=full` +
    `&access_token=${process.env.MAPBOX_TOKEN}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || !result.routes?.length) {
      console.error("Mapbox error:", result.message || response.status);
      return;
    }

    console.log("Mapbox connection successful!");
    console.log("Route distance:", result.routes[0].distance, "meters");
    console.log("Road coordinates:", result.routes[0].geometry.coordinates.length);
  } catch (error) {
    console.error("Connection failed:", error.message);
  }
}

testMapbox();