
require("dotenv").config();

const path = require("path");
const { pathToFileURL } = require("url");

const API_URL =
  process.env.TRAIL_API_URL ||
  "https://hiking-trail-guide-api.vercel.app/api";

const EXTRA_TRAILS = [
  {
    id: "daraitan",
    name: "Mt. Daraitan",
    region: "Tanay, Rizal",
    latitude: 14.5968,
    longitude: 121.4333,
    difficulty: "Moderate",
    distanceKm: 5,
    elevationM: 739,
    duration: "4–6 hours",
    bestSeason: "Check weather and local access",
    description:
      "A popular mountain hike in Tanay, Rizal, known for forest trails and views of the Sierra Madre.",
    highlights: ["Sierra Madre views", "Forest trail", "Summit hike"],
    photos: [],
  },
  {
    id: "batolusong",
    name: "Mt. Batolusong",
    region: "Tanay, Rizal",
    latitude: 14.6117,
    longitude: 121.3725,
    difficulty: "Moderate",
    distanceKm: 7,
    elevationM: 880,
    duration: "4–6 hours",
    bestSeason: "Check weather and local access",
    description:
      "A mountain destination in Tanay featuring open grasslands, rolling ridges, and panoramic views.",
    highlights: ["Rolling ridges", "Grassland scenery", "Mountain views"],
    photos: [],
  },
  {
    id: "balagbag",
    name: "Mt. Balagbag",
    region: "Rodriguez, Rizal / Bulacan",
    latitude: 14.8035,
    longitude: 121.1675,
    difficulty: "Easy",
    distanceKm: 5,
    elevationM: 777,
    duration: "3–5 hours",
    bestSeason: "Check weather and local access",
    description:
      "A beginner-friendly mountain destination near the Rizal and Bulacan boundary with broad landscape views.",
    highlights: ["Beginner-friendly hike", "Open terrain", "Scenic views"],
    photos: [],
  },
  {
    id: "mayon",
    name: "Mayon Volcano",
    region: "Albay, Bicol",
    latitude: 13.2575,
    longitude: 123.6855,
    difficulty: "Expert",
    distanceKm: null,
    elevationM: 2463,
    duration: "Varies by permitted activity",
    bestSeason: "Check official volcano alerts and access restrictions",
    description:
      "An iconic volcano in Albay known for its near-symmetrical cone. Summit access may be prohibited or restricted.",
    highlights: ["Iconic volcano", "Volcanic landscape", "Albay scenery"],
    photos: [],
  },
  {
    id: "kanlaon",
    name: "Mt. Kanlaon",
    region: "Negros Occidental / Negros Oriental",
    latitude: 10.4125,
    longitude: 123.1325,
    difficulty: "Expert",
    distanceKm: null,
    elevationM: 2435,
    duration: "Varies by permitted route",
    bestSeason: "Only when authorities permit access",
    description:
      "A major volcanic peak on Negros Island. Hiking access depends on current volcanic activity and official restrictions.",
    highlights: ["Volcanic landscape", "Negros highlands", "Protected natural area"],
    photos: [],
  },
  {
    id: "hibok-hibok",
    name: "Mt. Hibok-Hibok",
    region: "Camiguin",
    latitude: 9.2035,
    longitude: 124.6735,
    difficulty: "Hard",
    distanceKm: null,
    elevationM: 1332,
    duration: "Varies by authorized route",
    bestSeason: "Check weather and local trail access",
    description:
      "A volcanic mountain on Camiguin Island with forested slopes and views of the surrounding island and sea.",
    highlights: ["Volcanic scenery", "Forest vegetation", "Island views"],
    photos: [],
  },
  {
    id: "guiting-guiting",
    name: "Mt. Guiting-Guiting",
    region: "Sibuyan Island, Romblon",
    latitude: 12.4205,
    longitude: 122.5655,
    difficulty: "Expert",
    distanceKm: null,
    elevationM: 2058,
    duration: "Multi-day expedition",
    bestSeason: "Check local permits and weather",
    description:
      "A challenging mountain on Sibuyan Island known for rugged ridges, steep terrain, and rich biodiversity.",
    highlights: ["Rugged ridges", "Biodiversity", "Challenging climb"],
    photos: [],
  },
  {
    id: "kitanglad",
    name: "Mt. Kitanglad",
    region: "Bukidnon",
    latitude: 8.125,
    longitude: 124.916,
    difficulty: "Hard",
    distanceKm: null,
    elevationM: 2899,
    duration: "Multi-day expedition",
    bestSeason: "Check permits and local conditions",
    description:
      "A prominent peak in Bukidnon within the Kitanglad Mountain Range, known for its montane forests and biodiversity.",
    highlights: ["Montane forest", "Mountain biodiversity", "Highland scenery"],
    photos: [],
  },
  {
    id: "kalatungan",
    name: "Mt. Kalatungan",
    region: "Bukidnon",
    latitude: 7.971,
    longitude: 124.806,
    difficulty: "Expert",
    distanceKm: null,
    elevationM: 2824,
    duration: "Multi-day expedition",
    bestSeason: "Check permits and local conditions",
    description:
      "A rugged mountain in Bukidnon with forested slopes and challenging terrain. Plan only with authorized local guides.",
    highlights: ["Remote mountain terrain", "Forest ecosystem", "Highland scenery"],
    photos: [],
  },
  {
    id: "dulang-dulang",
    name: "Mt. Dulang-Dulang",
    region: "Bukidnon",
    latitude: 8.116,
    longitude: 124.923,
    difficulty: "Expert",
    distanceKm: null,
    elevationM: 2938,
    duration: "Multi-day expedition",
    bestSeason: "Check permits and local conditions",
    description:
      "One of the Philippines' highest peaks, located in the Kitanglad Range and known for its high-elevation forest.",
    highlights: ["High-elevation forest", "Mountain biodiversity", "Challenging expedition"],
    photos: [],
  },
];

async function loadExistingTrails() {
  const mockTrailsPath = path.resolve(
    __dirname,
    "../constants/mockTrails.js"
  );

  const { MOCK_TRAILS } = await import(
    pathToFileURL(mockTrailsPath).href
  );

  if (!Array.isArray(MOCK_TRAILS) || MOCK_TRAILS.length === 0) {
  throw new Error(
    "No existing trails were found in constants/mockTrails.js."
  );
}

console.log(`Loaded ${MOCK_TRAILS.length} existing trails.`);

  return MOCK_TRAILS;
}

function validatePhilippineTrails(trails) {
  const ids = new Set();

  for (const trail of trails) {
    if (!trail.id || !trail.name) {
      throw new Error("A trail is missing its ID or name.");
    }

    if (ids.has(trail.id)) {
      throw new Error(`Duplicate trail ID: ${trail.id}`);
    }

    ids.add(trail.id);

    if (
      !Number.isFinite(Number(trail.latitude)) ||
      !Number.isFinite(Number(trail.longitude)) ||
      Number(trail.latitude) < 4.5 ||
      Number(trail.latitude) > 21.5 ||
      Number(trail.longitude) < 116 ||
      Number(trail.longitude) > 127
    ) {
      throw new Error(
        `Trail is outside the Philippines or has invalid coordinates: ${trail.name}`
      );
    }
  }
}

async function main() {
  const secret = process.env.TRAIL_SYNC_SECRET;

  if (!secret) {
    throw new Error(
      "TRAIL_SYNC_SECRET is missing from backend/.env."
    );
  }

  console.log("Loading existing Philippine trails...");

  const existingTrails = await loadExistingTrails();

  const trailsById = new Map();

  for (const trail of existingTrails) {
    trailsById.set(trail.id, trail);
  }

  for (const trail of EXTRA_TRAILS) {
    trailsById.set(trail.id, trail);
  }

  const trails = Array.from(trailsById.values());

  if (trails.length !== 26) {
    throw new Error(
      `Expected 26 unique trails, but found ${trails.length}.`
    );
  }

  validatePhilippineTrails(trails);

  console.log("==================================");
  console.log("PEAKLY Philippine Trail Sync");
  console.log("==================================");
  console.log(`Backend: ${API_URL}`);
  console.log(`Existing trails: ${existingTrails.length}`);
  console.log(`Additional trails: ${EXTRA_TRAILS.length}`);
  console.log(`Total trails: ${trails.length}`);

  console.log("\nSending replacement request to Turso...");

  const response = await fetch(
    `${API_URL}/admin/trails/sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trail-sync-secret": secret,
      },
      body: JSON.stringify({
        trails,
        replace: true,
      }),
      signal: AbortSignal.timeout(120000),
    }
  );

  const responseText = await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Unexpected backend response (HTTP ${response.status}): ${responseText.slice(0, 300)}`
    );
  }

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.message ||
        `Trail sync failed with HTTP ${response.status}.`
    );
  }

  console.log("\n==================================");
  console.log("Trail synchronization successful.");
  console.log(`Trails submitted: ${trails.length}`);
  console.log(`Trails in database: ${result.totalInDatabase ?? "Check health endpoint"}`);
  console.log(`Replacement enabled: ${result.replaced === true}`);
  console.log("==================================");
}

main().catch((error) => {
  console.error("\nSynchronization failed:", error.message);
  process.exitCode = 1;
});
