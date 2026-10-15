
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");

const app = express();

app.get("/api/deploy-check", (req, res) => {
  res.json({
    success: true,
    message: "Latest server.js is running."
  });
});

app.use(cors());
app.use(express.json({ limit: "8mb" }));

const JWT_SECRET = process.env.JWT_SECRET;
const TRAIL_SYNC_SECRET = process.env.TRAIL_SYNC_SECRET;
const MAX_PROFILE_PHOTO_LENGTH = 6_000_000;
const PROFILE_PHOTO_PREFIX = "data:image/jpeg;base64,";

const dbReady = (async () => {
  if (
    !process.env.TURSO_DATABASE_URL ||
    !process.env.TURSO_AUTH_TOKEN ||
    !JWT_SECRET
  ) {
    throw new Error("Missing required environment variables.");
  }

    await db.execute(`
    CREATE TABLE IF NOT EXISTS trails (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT,
      latitude REAL,
      longitude REAL,
      difficulty TEXT,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trail_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trail_id) REFERENCES trails(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_reviews_trail_created
    ON reviews (trail_id, created_at)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let columns = await db.execute("PRAGMA table_info(users)");

  if (!columns.rows.some((column) => column.name === "display_name")) {
    await db.execute(
      "ALTER TABLE users ADD COLUMN display_name TEXT"
    );
  }

  columns = await db.execute("PRAGMA table_info(users)");

  if (!columns.rows.some((column) => column.name === "profile_photo")) {
    await db.execute(
      "ALTER TABLE users ADD COLUMN profile_photo TEXT"
    );
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_trails_region
    ON trails (region)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      trail_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, trail_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (trail_id) REFERENCES trails(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      trail_id TEXT,
      trail_name TEXT,
      started_at TEXT NOT NULL DEFAULT '',
      ended_at TEXT NOT NULL DEFAULT '',
      duration_s REAL NOT NULL DEFAULT 0,
      distance_m REAL NOT NULL DEFAULT 0,
      ascent_m REAL,
      points_json TEXT NOT NULL DEFAULT '[]',
      saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'completed',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const trackColumnsToAdd = [
    ["user_id", "INTEGER NOT NULL DEFAULT 0"],
    ["trail_id", "TEXT"],
    ["trail_name", "TEXT"],
    ["started_at", "TEXT NOT NULL DEFAULT ''"],
    ["ended_at", "TEXT NOT NULL DEFAULT ''"],
    ["duration_s", "REAL NOT NULL DEFAULT 0"],
    ["distance_m", "REAL NOT NULL DEFAULT 0"],
    ["ascent_m", "REAL"],
    ["points_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["saved_at", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'completed'"],
  ];

  let trackColumns = await db.execute("PRAGMA table_info(tracks)");

  for (const [name, definition] of trackColumnsToAdd) {
    if (!trackColumns.rows.some((column) => column.name === name)) {
      await db.execute(
        `ALTER TABLE tracks ADD COLUMN ${name} ${definition}`
      );

      trackColumns = await db.execute("PRAGMA table_info(tracks)");
    }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_tracks_user_saved
    ON tracks (user_id, saved_at)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_one_id INTEGER NOT NULL,
      user_two_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_one_id, user_two_id),
      FOREIGN KEY (user_one_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_two_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT,
      FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (conversation_id, id)
  `);

  console.log("Database initialization completed.");
})();

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (
      !payload.userId ||
      !Number.isFinite(Number(payload.userId))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    req.userId = Number(payload.userId);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session is invalid or expired. Please log in again.",
    });
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTrail(row) {
  if (!row) return null;

  let data = {};

  try {
    const parsed = JSON.parse(row.data_json || "{}");

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {}

  const latitude = numberOrNull(
    data.latitude ?? data.lat ?? row.latitude
  );

  const longitude = numberOrNull(
    data.longitude ?? data.lng ?? data.lon ?? row.longitude
  );

  return {
    ...data,
    id: String(data.id ?? row.id),
    name: data.name ?? row.name ?? "Unnamed trail",
    region: data.region ?? row.region ?? "Unknown region",
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    difficulty: data.difficulty ?? row.difficulty ?? "Unknown",
  };
}

function parseTrack(row) {
  if (!row) return null;

  let points = [];

  try {
    const parsed = JSON.parse(row.points_json || "[]");

    if (Array.isArray(parsed)) {
      points = parsed;
    }
  } catch {}

  return {
    id: `track_${row.id}`,
    trailId: row.trail_id ?? null,
    trailName: row.trail_name ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationS: Number(row.duration_s || 0),
    distanceM: Number(row.distance_m || 0),
    ascentM:
      row.ascent_m == null ? null : Number(row.ascent_m),
    points,
    status: row.status === "discarded" ? "discarded" : "completed",
    savedAt: row.saved_at || row.started_at || null,
    synced: true,
  };
}

function getTrackDatabaseId(id) {
  const match = /^(?:track_)?(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : null;
}

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await dbReady;
    await db.execute("SELECT 1");

    const result = await db.execute(
      "SELECT COUNT(*) AS count FROM trails"
    );

    res.json({
      success: true,
      message: "API and database are connected.",
      trailCount: Number(result.rows[0]?.count || 0),
    });
  })
);

app.get("/api/debug/routes", (req, res) => {
  res.json({
    success: true,
    message: "Updated PEAKLY backend is running.",
  });
});


app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    await dbReady;

    const { username, email, password } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required.",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 6 || cleanUsername.length > 16) {
      return res.status(400).json({
        success: false,
        message: "Username must be 6–16 characters long.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and no more than 72 bytes.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await db.execute({
        sql: `
          INSERT INTO users (username, email, password_hash)
          VALUES (?, ?, ?)
        `,
        args: [cleanUsername, cleanEmail, passwordHash],
      });
    } catch (error) {
      if (
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        String(error.message).toLowerCase().includes("unique constraint")
      ) {
        return res.status(409).json({
          success: false,
          message: "That username or email is already registered.",
        });
      }

      throw error;
    }

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
    });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    await dbReady;

    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const result = await db.execute({
      sql: `
        SELECT id, username, email, password_hash
        FROM users
        WHERE email = ? COLLATE NOCASE
      `,
      args: [email.trim()],
    });

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password.",
      });
    }

    const token = jwt.sign(
      { userId: Number(user.id) },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: Number(user.id),
        username: user.username,
        email: user.email,
      },
    });
  })
);

app.get(
  "/api/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `
        SELECT id, username, email, display_name, profile_photo, created_at
        FROM users
        WHERE id = ?
      `,
      args: [req.userId],
    });

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const user = result.rows[0];

    const stats = await db.execute({
      sql: `
        SELECT
          COUNT(*) AS hike_count,
          COALESCE(SUM(distance_m), 0) AS distance_m,
          COALESCE(SUM(ascent_m), 0) AS ascent_m
        FROM tracks
        WHERE user_id = ? AND status = 'completed'
      `,
      args: [req.userId],
    });

    const favorites = await db.execute({
      sql: "SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?",
      args: [req.userId],
    });

    const s = stats.rows[0];

    res.json({
      success: true,
      profile: {
        id: Number(user.id),
        username: user.username,
        displayName: user.display_name || user.username,
        email: user.email,
        profilePhoto: user.profile_photo || null,
        createdAt: user.created_at,
        stats: {
          hikes: Number(s.hike_count),
          distanceKm: Number(s.distance_m) / 1000,
          elevationM: Number(s.ascent_m),
          savedTrails: Number(favorites.rows[0].count),
        },
      },
    });
  })
);

app.put(
  "/api/profile/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const { profilePhoto } = req.body || {};

    if (
      typeof profilePhoto !== "string" ||
      !profilePhoto.startsWith(PROFILE_PHOTO_PREFIX) ||
      profilePhoto.length > MAX_PROFILE_PHOTO_LENGTH
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or oversized profile photo. Please choose a smaller JPEG image.",
      });
    }

    const base64Data = profilePhoto.slice(
      PROFILE_PHOTO_PREFIX.length
    );

    if (!base64Data || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
      return res.status(400).json({
        success: false,
        message: "The selected profile photo is invalid.",
      });
    }

    const imageBuffer = Buffer.from(base64Data, "base64");

    if (
      !imageBuffer.length ||
      imageBuffer.length > 4_400_000 ||
      imageBuffer.toString("base64") !== base64Data
    ) {
      return res.status(400).json({
        success: false,
        message: "The image data is invalid or too large.",
      });
    }

    const result = await db.execute({
      sql: "UPDATE users SET profile_photo = ? WHERE id = ?",
      args: [profilePhoto, req.userId],
    });

    if (!Number(result.rowsAffected)) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    res.json({
      success: true,
      message: "Profile photo saved successfully.",
      profilePhoto,
    });
  })
);

app.delete(
  "/api/profile/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: "UPDATE users SET profile_photo = NULL WHERE id = ?",
      args: [req.userId],
    });

    if (!Number(result.rowsAffected)) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    res.json({
      success: true,
      message: "Profile photo removed successfully.",
    });
  })
);

app.patch(
  "/api/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const { displayName, username } = req.body || {};

    if (
      typeof displayName !== "string" ||
      typeof username !== "string" ||
      !displayName.trim() ||
      !username.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Display name and username are required.",
      });
    }

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim();

    if (cleanDisplayName.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Display name must not exceed 50 characters.",
      });
    }

    if (!/^[a-zA-Z0-9_]{6,16}$/.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        message: "Username must be 6–16 characters and use only letters, numbers, or underscores.",
      });
    }

    try {
      await db.execute({
        sql: `
          UPDATE users
          SET display_name = ?, username = ?
          WHERE id = ?
        `,
        args: [cleanDisplayName, cleanUsername, req.userId],
      });
    } catch (error) {
      if (
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        String(error.message).toLowerCase().includes("unique constraint")
      ) {
        return res.status(409).json({
          success: false,
          message: "That username is already taken.",
        });
      }

      throw error;
    }

    const result = await db.execute({
      sql: `
        SELECT id, username, email, display_name, profile_photo, created_at
        FROM users
        WHERE id = ?
      `,
      args: [req.userId],
    });

    const user = result.rows[0];

    res.json({
      success: true,
      message: "Profile updated successfully.",
      profile: {
        id: Number(user.id),
        username: user.username,
        displayName: user.display_name || user.username,
        email: user.email,
        profilePhoto: user.profile_photo || null,
        createdAt: user.created_at,
      },
    });
  })
);

/* TRAILS */

app.get(
  "/api/trails",
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute(`
      SELECT data_json, id, name, region, latitude, longitude, difficulty
      FROM trails
      ORDER BY name COLLATE NOCASE
      LIMIT 10000
    `);

    const trails = result.rows
      .map(parseTrail)
      .filter(
        (trail) =>
          trail &&
          trail.latitude !== null &&
          trail.longitude !== null
      );

    res.json({
      success: true,
      count: trails.length,
      trails,
    });
  })
);

app.get(
  "/api/trails/area",
  asyncHandler(async (req, res) => {
    await dbReady;

    const minLat = Number(req.query.minLat);
    const maxLat = Number(req.query.maxLat);
    const minLon = Number(req.query.minLon);
    const maxLon = Number(req.query.maxLon);

    const values = [minLat, maxLat, minLon, maxLon];

    if (
      values.some((value) => !Number.isFinite(value)) ||
      minLat < -90 ||
      maxLat > 90 ||
      minLat >= maxLat ||
      minLon < -180 ||
      maxLon > 180 ||
      minLon >= maxLon
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid map boundaries.",
      });
    }

    const result = await db.execute({
      sql: `
        SELECT data_json, id, name, region, latitude, longitude, difficulty
        FROM trails
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
        ORDER BY name COLLATE NOCASE
        LIMIT 1000
      `,
      args: [minLat, maxLat, minLon, maxLon],
    });

    const trails = result.rows
      .map(parseTrail)
      .filter(
        (trail) =>
          trail &&
          trail.latitude !== null &&
          trail.longitude !== null
      );

    res.json({
      success: true,
      count: trails.length,
      trails,
    });
  })
);

app.get(
  "/api/trails/:id",
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `
        SELECT data_json, id, name, region, latitude, longitude, difficulty
        FROM trails
        WHERE id = ?
      `,
      args: [req.params.id],
    });

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Trail not found.",
      });
    }

    res.json({
      success: true,
      trail: parseTrail(result.rows[0]),
    });
  })
);

/* SYNCHRONIZE TRAILS INTO TURSO */


/* SYNCHRONIZE OR REPLACE TRAILS IN TURSO */

app.post(
  "/api/admin/trails/sync",
  asyncHandler(async (req, res) => {
    await dbReady;

    if (!TRAIL_SYNC_SECRET) {
      return res.status(503).json({
        success: false,
        message: "Trail synchronization is not configured.",
      });
    }

    const suppliedSecret = req.headers["x-trail-sync-secret"];

    if (
      typeof suppliedSecret !== "string" ||
      suppliedSecret.length !== TRAIL_SYNC_SECRET.length ||
      !crypto.timingSafeEqual(
        Buffer.from(suppliedSecret),
        Buffer.from(TRAIL_SYNC_SECRET)
      )
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const trails = req.body?.trails;
    const replace = req.body?.replace === true;

    if (!Array.isArray(trails)) {
      return res.status(400).json({
        success: false,
        message: "Send a trails array.",
      });
    }

    if (trails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "The trails array cannot be empty.",
      });
    }

    if (trails.length > 500) {
      return res.status(413).json({
        success: false,
        message: "Too many trails in one request.",
      });
    }

    const preparedTrails = [];
    const seenIds = new Set();

    for (const trail of trails) {
      if (
        !trail ||
        (typeof trail.id !== "string" &&
          typeof trail.id !== "number") ||
        !String(trail.id).trim() ||
        typeof trail.name !== "string" ||
        !trail.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Every trail needs an id and name.",
        });
      }

      const data = {
        ...trail,
        id: String(trail.id).trim(),
        name: trail.name.trim(),
      };

      if (seenIds.has(data.id)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate trail ID: ${data.id}.`,
        });
      }

      seenIds.add(data.id);

      const latitude = numberOrNull(
        data.latitude ?? data.lat
      );

      const longitude = numberOrNull(
        data.longitude ?? data.lng ?? data.lon
      );

      if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid coordinates for trail ${data.id}.`,
        });
      }

      data.latitude = latitude;
      data.longitude = longitude;

      preparedTrails.push(data);
    }

    const statements = [];

    if (replace) {
      const ids = preparedTrails.map((trail) => trail.id);
      const placeholders = ids.map(() => "?").join(", ");

      // Remove favorites for trails that will no longer exist.
      statements.push({
        sql: `
          DELETE FROM favorites
          WHERE trail_id NOT IN (${placeholders})
        `,
        args: ids,
      });

      // Remove all old trails not included in the new list.
      statements.push({
        sql: `
          DELETE FROM trails
          WHERE id NOT IN (${placeholders})
        `,
        args: ids,
      });
    }

    for (const data of preparedTrails) {
      statements.push({
        sql: `
          INSERT INTO trails (
            id, name, region, latitude, longitude,
            difficulty, data_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            region = excluded.region,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            difficulty = excluded.difficulty,
            data_json = excluded.data_json,
            updated_at = CURRENT_TIMESTAMP
        `,
        args: [
          data.id,
          data.name,
          data.region ?? null,
          data.latitude,
          data.longitude,
          data.difficulty ?? null,
          JSON.stringify(data),
        ],
      });
    }

    // Turso/libSQL executes the batch as a transaction.
    await db.batch(statements, "write");

    const result = await db.execute(
      "SELECT COUNT(*) AS count FROM trails"
    );

    res.json({
      success: true,
      message: replace
        ? "Trail database replaced successfully."
        : "Trails synchronized successfully.",
      replaced: replace,
      received: preparedTrails.length,
      totalInDatabase: Number(result.rows[0]?.count || 0),
    });
  })
);
/* FAVORITES */

app.get(
  "/api/favorites",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `
        SELECT
          t.data_json, t.id, t.name, t.region,
          t.latitude, t.longitude, t.difficulty,
          f.created_at
        FROM favorites f
        JOIN trails t ON t.id = f.trail_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
      `,
      args: [req.userId],
    });

    res.json({
      success: true,
      favorites: result.rows.map((row) => ({
        ...parseTrail(row),
        favoritedAt: row.created_at,
      })),
    });
  })
);

app.post(
  "/api/favorites/:trailId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const trail = await db.execute({
      sql: "SELECT id FROM trails WHERE id = ?",
      args: [req.params.trailId],
    });

    if (!trail.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Trail not found.",
      });
    }

    await db.execute({
      sql: `
        INSERT INTO favorites (user_id, trail_id)
        VALUES (?, ?)
        ON CONFLICT(user_id, trail_id) DO NOTHING
      `,
      args: [req.userId, req.params.trailId],
    });

    res.json({
      success: true,
      message: "Trail added to favorites.",
    });
  })
);

app.delete(
  "/api/favorites/:trailId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    await db.execute({
      sql: `
        DELETE FROM favorites
        WHERE user_id = ? AND trail_id = ?
      `,
      args: [req.userId, req.params.trailId],
    });

    res.json({
      success: true,
      message: "Favorite removed.",
    });
  })
);

/* HIKING HISTORY */

app.post(
  "/api/tracks",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const body = req.body || {};

    const trailId =
      body.trailId == null ? null : String(body.trailId);

    const trailName =
      body.trailName == null ? null : String(body.trailName);

    const startedAt = body.startedAt;
    const endedAt = body.endedAt;
    const durationS = Number(body.durationS);
    const distanceM = Number(body.distanceM);
    const ascentM =
      body.ascentM == null ? null : Number(body.ascentM);

    const points = body.points;
    const status =
      body.status === "discarded" ? "discarded" : "completed";

    if (
      typeof startedAt !== "string" ||
      !Number.isFinite(Date.parse(startedAt)) ||
      typeof endedAt !== "string" ||
      !Number.isFinite(Date.parse(endedAt)) ||
      !Number.isFinite(durationS) ||
      durationS < 0 ||
      !Number.isFinite(distanceM) ||
      distanceM < 0 ||
      (ascentM !== null && !Number.isFinite(ascentM)) ||
      !Array.isArray(points) ||
      points.length > 100000
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid recorded track data.",
      });
    }

    for (const point of points) {
      const latitude = Number(
        point?.latitude ?? point?.lat
      );

      const longitude = Number(
        point?.longitude ?? point?.lng ?? point?.lon
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "Track contains invalid GPS points.",
        });
      }
    }

    const result = await db.execute({
      sql: `
        INSERT INTO tracks (
          user_id, trail_id, trail_name, started_at, ended_at,
          duration_s, distance_m, ascent_m, points_json, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        req.userId,
        trailId,
        trailName,
        startedAt,
        endedAt,
        durationS,
        distanceM,
        ascentM,
        JSON.stringify(points),
        status,
      ],
    });

    const saved = await db.execute({
      sql: `
        SELECT *
        FROM tracks
        WHERE id = ? AND user_id = ?
      `,
      args: [Number(result.lastInsertRowid), req.userId],
    });

    res.status(201).json({
      success: true,
      track: parseTrack(saved.rows[0]),
    });
  })
);

app.get(
  "/api/tracks",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `
        SELECT *
        FROM tracks
        WHERE user_id = ?
        ORDER BY saved_at DESC, id DESC
      `,
      args: [req.userId],
    });

    res.json({
      success: true,
      tracks: result.rows.map(parseTrack),
    });
  })
);

app.get(
  "/api/tracks/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const id = getTrackDatabaseId(req.params.id);

    if (id === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid track ID.",
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM tracks
        WHERE id = ? AND user_id = ?
      `,
      args: [id, req.userId],
    });

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Recorded hike not found.",
      });
    }

    res.json({
      success: true,
      track: parseTrack(result.rows[0]),
    });
  })
);

app.delete(
  "/api/tracks/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const id = getTrackDatabaseId(req.params.id);

    if (id === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid track ID.",
      });
    }

    const result = await db.execute({
      sql: `
        DELETE FROM tracks
        WHERE id = ? AND user_id = ?
      `,
      args: [id, req.userId],
    });

    res.json({
      success: true,
      deleted: Number(result.rowsAffected) > 0,
    });
  })
);

/* CHAT */

app.get(
  "/api/chat/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 50)
        : "";

    const result = await db.execute({
      sql: `
        SELECT id, username, display_name, profile_photo
        FROM users
        WHERE id != ?
          AND (
            ? = ''
            OR username LIKE ?
            OR COALESCE(display_name, '') LIKE ?
          )
        ORDER BY username COLLATE NOCASE
        LIMIT 50
      `,
      args: [
        req.userId,
        search,
        `%${search}%`,
        `%${search}%`,
      ],
    });

    res.json({
      success: true,
      users: result.rows.map((user) => ({
        id: Number(user.id),
        username: user.username,
        displayName: user.display_name || user.username,
        profilePhoto: user.profile_photo || null,
      })),
    });
  })
);

app.get(
  "/api/chat/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `
        SELECT
          c.id,
          c.created_at,
          u.id AS other_user_id,
          u.username AS other_username,
          u.display_name AS other_display_name,
          u.profile_photo AS other_profile_photo,
          (
            SELECT m.body
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC LIMIT 1
          ) AS last_message,
          (
            SELECT m.created_at
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC LIMIT 1
          ) AS last_message_at,
          (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != ?
              AND m.read_at IS NULL
          ) AS unread_count
        FROM conversations c
        JOIN users u
          ON u.id = CASE
            WHEN c.user_one_id = ? THEN c.user_two_id
            ELSE c.user_one_id
          END
        WHERE c.user_one_id = ? OR c.user_two_id = ?
        ORDER BY COALESCE(
          (
            SELECT MAX(m.id)
            FROM messages m
            WHERE m.conversation_id = c.id
          ),
          c.id
        ) DESC
      `,
      args: [
        req.userId,
        req.userId,
        req.userId,
        req.userId,
      ],
    });

    res.json({
      success: true,
      conversations: result.rows.map((row) => ({
        id: Number(row.id),
        createdAt: row.created_at,
        otherUser: {
          id: Number(row.other_user_id),
          username: row.other_username,
          displayName:
            row.other_display_name || row.other_username,
          profilePhoto: row.other_profile_photo || null,
        },
        lastMessage: row.last_message || null,
        lastMessageAt: row.last_message_at || null,
        unreadCount: Number(row.unread_count || 0),
      })),
    });
  })
);

app.post(
  "/api/chat/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const otherUserId = Number(req.body?.userId);

    if (
      !Number.isSafeInteger(otherUserId) ||
      otherUserId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID is required.",
      });
    }

    if (otherUserId === req.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot start a chat with yourself.",
      });
    }

    const userResult = await db.execute({
      sql: `
        SELECT id, username, display_name, profile_photo
        FROM users
        WHERE id = ?
      `,
      args: [otherUserId],
    });

    if (!userResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const userOneId = Math.min(req.userId, otherUserId);
    const userTwoId = Math.max(req.userId, otherUserId);

    await db.execute({
      sql: `
        INSERT INTO conversations (user_one_id, user_two_id)
        VALUES (?, ?)
        ON CONFLICT(user_one_id, user_two_id) DO NOTHING
      `,
      args: [userOneId, userTwoId],
    });

    const conversationResult = await db.execute({
      sql: `
        SELECT id, created_at
        FROM conversations
        WHERE user_one_id = ? AND user_two_id = ?
      `,
      args: [userOneId, userTwoId],
    });

    const conversation = conversationResult.rows[0];
    const user = userResult.rows[0];

    res.json({
      success: true,
      conversation: {
        id: Number(conversation.id),
        createdAt: conversation.created_at,
        otherUser: {
          id: Number(user.id),
          username: user.username,
          displayName: user.display_name || user.username,
          profilePhoto: user.profile_photo || null,
        },
      },
    });
  })
);

app.get(
  "/api/chat/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const conversationId = Number(req.params.id);

    if (
      !Number.isSafeInteger(conversationId) ||
      conversationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID.",
      });
    }

    const conversation = await db.execute({
      sql: `
        SELECT id
        FROM conversations
        WHERE id = ?
          AND (user_one_id = ? OR user_two_id = ?)
      `,
      args: [
        conversationId,
        req.userId,
        req.userId,
      ],
    });

    if (!conversation.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    await db.execute({
      sql: `
        UPDATE messages
        SET read_at = CURRENT_TIMESTAMP
        WHERE conversation_id = ?
          AND sender_id != ?
          AND read_at IS NULL
      `,
      args: [conversationId, req.userId],
    });

    const result = await db.execute({
      sql: `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.body,
          m.created_at,
          m.read_at,
          u.username AS sender_username,
          u.display_name AS sender_display_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.id DESC
        LIMIT 500
      `,
      args: [conversationId],
    });

    res.json({
      success: true,
      messages: result.rows.reverse().map((row) => ({
        id: Number(row.id),
        conversationId: Number(row.conversation_id),
        senderId: Number(row.sender_id),
        senderUsername: row.sender_username,
        senderDisplayName:
          row.sender_display_name || row.sender_username,
        body: row.body,
        createdAt: row.created_at,
        readAt: row.read_at || null,
      })),
    });
  })
);

app.post(
  "/api/chat/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const conversationId = Number(req.params.id);

    const body =
      typeof req.body?.body === "string"
        ? req.body.body.trim()
        : "";

    if (
      !Number.isSafeInteger(conversationId) ||
      conversationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID.",
      });
    }

    if (!body) {
      return res.status(400).json({
        success: false,
        message: "Please enter a message.",
      });
    }

    if (body.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Messages cannot exceed 2,000 characters.",
      });
    }

    const conversation = await db.execute({
      sql: `
        SELECT id
        FROM conversations
        WHERE id = ?
          AND (user_one_id = ? OR user_two_id = ?)
      `,
      args: [
        conversationId,
        req.userId,
        req.userId,
      ],
    });

    if (!conversation.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const inserted = await db.execute({
      sql: `
        INSERT INTO messages (conversation_id, sender_id, body)
        VALUES (?, ?, ?)
      `,
      args: [conversationId, req.userId, body],
    });

    const result = await db.execute({
      sql: `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.body,
          m.created_at,
          m.read_at,
          u.username AS sender_username,
          u.display_name AS sender_display_name
          u.profile_photo AS sender_profile_photo
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id = ?
      `,
      args: [Number(inserted.lastInsertRowid)],
    });

    const row = result.rows[0];

    res.status(201).json({
      success: true,
      message: {
        id: Number(row.id),
        conversationId: Number(row.conversation_id),
        senderId: Number(row.sender_id),
        senderUsername: row.sender_username,
        senderDisplayName:
          row.sender_display_name || row.sender_username,
        body: row.body,
        createdAt: row.created_at,
        profilePhoto: row.reviewer_photo,
        readAt: row.read_at || null,
      },
    });
  })
);

app.get("/api/trails/:trailId/reviews", asyncHandler(async (req, res) => {
  await dbReady;

  const trailId = req.params.trailId;

  const trailResult = await db.execute({
    sql: "SELECT id FROM trails WHERE id = ?",
    args: [trailId],
  });

  if (trailResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Trail not found.",
    });
  }

  
  const result = await db.execute({
    sql: `
      SELECT
        r.id,
        r.trail_id,
        r.rating,
        r.comment,
        r.created_at,
        COALESCE(NULLIF(u.display_name, ''), u.username) AS reviewer_name,
        u.profile_photo AS reviewer_photo
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.trail_id = ?
      ORDER BY r.created_at DESC, r.id DESC
    `,
    args: [trailId],
  });


  const reviews = result.rows.map((row) => ({
    id: String(row.id),
    trailId: row.trail_id,
    rating: Number(row.rating),
    comment: row.comment,
    reviewerName: row.reviewer_name,
    profilePhoto: row.reviewer_photo,
    createdAt: row.created_at,
  }));

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  res.json({
    success: true,
    count: reviews.length,
    averageRating: Number(averageRating.toFixed(1)),
    reviews,
  });
}));

app.post(
  "/api/trails/:trailId/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const trailId = req.params.trailId;
    const rating = Number(req.body.rating);
    const comment =
      typeof req.body.comment === "string"
        ? req.body.comment.trim()
        : "";

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    if (!comment || comment.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Comment is required and must not exceed 1000 characters.",
      });
    }

    const trailResult = await db.execute({
      sql: "SELECT id FROM trails WHERE id = ?",
      args: [trailId],
    });

    if (trailResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trail not found.",
      });
    }

    const insertResult = await db.execute({
      sql: `
        INSERT INTO reviews (trail_id, user_id, rating, comment)
        VALUES (?, ?, ?, ?)
      `,
      args: [trailId, req.userId, rating, comment],
    });

    

const result = await db.execute({
  sql: `
    SELECT
      r.id,
      r.trail_id,
      r.rating,
      r.comment,
      r.created_at,
      COALESCE(NULLIF(u.display_name, ''), u.username) AS reviewer_name,
      u.profile_photo AS reviewer_photo
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ?
  `,
  args: [insertResult.lastInsertRowid.toString()],
});


const row = result.rows[0];

res.status(201).json({
  success: true,
  review: {
    id: String(row.id),
    trailId: row.trail_id,
    rating: Number(row.rating),
    comment: row.comment,
    reviewerName: row.reviewer_name,
    profilePhoto: row.reviewer_photo || null,
    createdAt: row.created_at,
  },
});

  })
);
/* NOT FOUND AND ERROR HANDLERS */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found.",
  });
});

app.use((error, req, res, next) => {
  console.error("API request failed:", {
    method: req.method,
    path: req.originalUrl,
    code: error.code || null,
    message: error.message,
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

module.exports = app;
