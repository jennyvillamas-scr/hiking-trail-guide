require("dotenv").config();

const path = require("path");
const { pathToFileURL } = require("url");

const API_URL = "https://hiking-trail-guide-api.vercel.app/api";


async function syncTrails() {
  const secret = process.env.TRAIL_SYNC_SECRET;

  if (!secret) {
    throw new Error(
      "Missing TRAIL_SYNC_SECRET in backend/.env."
    );
  }

  const trailsFile = path.resolve(__dirname, "../constants/mockTrails.js");

  const { MOCK_TRAILS } = await import(
    pathToFileURL(trailsFile).href
  );

  if (!Array.isArray(MOCK_TRAILS) || MOCK_TRAILS.length === 0) {
    throw new Error("MOCK_TRAILS is empty or unavailable.");
  }

  console.log(`Found ${MOCK_TRAILS.length} trails.`);

  const response = await fetch(`${API_URL}/admin/trails/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trail-sync-secret": secret,
    },
    body: JSON.stringify({
      trails: MOCK_TRAILS,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || `Request failed with status ${response.status}.`
    );
  }

  console.log("Trail synchronization successful!");
  console.log(`Uploaded: ${result.count} trails.`);
}

syncTrails().catch((error) => {
  console.error("Trail synchronization failed:", error.message);
  process.exitCode = 1;
});