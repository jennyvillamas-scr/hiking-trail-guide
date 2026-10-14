
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");

const app = express();

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
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let userColumns = await db.execute("PRAGMA table_info(users)");

  if (!userColumns.rows.some((column) => column.name === "display_name")) {
    await db.execute("ALTER TABLE users ADD COLUMN display_name TEXT");
  }

  userColumns = await db.execute("PRAGMA table_info(users)");

  if (!userColumns.rows.some((column) => column.name === "profile_photo")) {
    await db.execute("ALTER TABLE users ADD COLUMN profile_photo TEXT");
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
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_s REAL NOT NULL DEFAULT 0,
      distance_m REAL NOT NULL DEFAULT 0,
      ascent_m REAL,
      points_json TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
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

    if (!payload.userId) {
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

function parseTrail(row) {
  if (!row) return null;

  try {
    return JSON.parse(row.data_json);
  } catch {
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      latitude: row.latitude,
      longitude: row.longitude,
      difficulty: row.difficulty,
    };
  }
}

function parseTrack(row) {
  return {
    id: `track_${row.id}`,
    trailId: row.trail_id,
    trailName: row.trail_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationS: Number(row.duration_s),
    distanceM: Number(row.distance_m),
    ascentM: row.ascent_m == null ? null : Number(row.ascent_m),
    points: JSON.parse(row.points_json),
    savedAt: row.saved_at,
  };
}

function getTrackDatabaseId(id) {
  const match = /^track_(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : null;
}

// HEALTH CHECK
app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await dbReady;
    await db.execute("SELECT 1");

    res.json({
      success: true,
      message: "API and database are connected.",
    });
  })
);

// AUTH: REGISTER
app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    await dbReady;

    const { username, email, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Username, email, and password are required.",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 6 || cleanUsername.length > 16) {
      return res.status(400).json({
        message: "Username must be 6–16 characters long.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and no more than 72 bytes.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await db.execute({
        sql: `INSERT INTO users (username, email, password_hash)
              VALUES (?, ?, ?)`,
        args: [cleanUsername, cleanEmail, passwordHash],
      });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
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

// AUTH: LOGIN
app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    await dbReady;

    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const result = await db.execute({
      sql: `SELECT id, username, email, password_hash
            FROM users
            WHERE email = ? COLLATE NOCASE`,
      args: [email.trim()],
    });

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
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

// PROFILE: GET CURRENT USER
app.get(
  "/api/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `SELECT id, username, email, display_name,
                   profile_photo, created_at
            FROM users
            WHERE id = ?`,
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
      sql: `SELECT
              COUNT(*) AS hike_count,
              COALESCE(SUM(distance_m), 0) AS distance_m,
              COALESCE(SUM(ascent_m), 0) AS ascent_m
            FROM tracks
            WHERE user_id = ?`,
      args: [req.userId],
    });

    const favorites = await db.execute({
      sql: "SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?",
      args: [req.userId],
    });

    const hikeStats = stats.rows[0];

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
          hikes: Number(hikeStats.hike_count),
          distanceKm: Number(hikeStats.distance_m) / 1000,
          elevationM: Number(hikeStats.ascent_m),
          savedTrails: Number(favorites.rows[0].count),
        },
      },
    });
  })
);

// PROFILE: SAVE PHOTO
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

    const base64Data = profilePhoto.slice(PROFILE_PHOTO_PREFIX.length);

    if (
      !base64Data ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected profile photo is invalid.",
      });
    }

    const imageBuffer = Buffer.from(base64Data, "base64");

    if (
      imageBuffer.length === 0 ||
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

    if (Number(result.rowsAffected) === 0) {
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

// PROFILE: REMOVE PHOTO
app.delete(
  "/api/profile/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: "UPDATE users SET profile_photo = NULL WHERE id = ?",
      args: [req.userId],
    });

    if (Number(result.rowsAffected) === 0) {
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

// PROFILE: UPDATE CURRENT USER
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
        message:
          "Username must be 6–16 characters and use only letters, numbers, or underscores.",
      });
    }

    try {
      await db.execute({
        sql: `UPDATE users
              SET display_name = ?, username = ?
              WHERE id = ?`,
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
      sql: `SELECT id, username, email, display_name,
                   profile_photo, created_at
            FROM users
            WHERE id = ?`,
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

// TRAILS: GET ALL
app.get(
  "/api/trails",
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute(`
      SELECT data_json, id, name, region, latitude, longitude, difficulty
      FROM trails
      ORDER BY name COLLATE NOCASE
    `);

    res.json({
      success: true,
      trails: result.rows.map(parseTrail),
    });
  })
);

// TRAILS: GET ONE
app.get(
  "/api/trails/:id",
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `SELECT data_json, id, name, region, latitude, longitude, difficulty
            FROM trails WHERE id = ?`,
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

// TRAILS: SECURE BULK SYNC
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

    if (!Array.isArray(trails)) {
      return res.status(400).json({
        success: false,
        message: "Send a trails array.",
      });
    }

    if (trails.length > 500) {
      return res.status(413).json({
        success: false,
        message: "Too many trails in one request.",
      });
    }

    const statements = [];

    for (const trail of trails) {
      if (
        !trail ||
        typeof trail.id !== "string" ||
        !trail.id.trim() ||
        typeof trail.name !== "string" ||
        !trail.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Every trail needs a string id and name.",
        });
      }

      const data = { ...trail, id: trail.id.trim() };

      statements.push({
        sql: `INSERT INTO trails
              (id, name, region, latitude, longitude, difficulty, data_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                region = excluded.region,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                difficulty = excluded.difficulty,
                data_json = excluded.data_json,
                updated_at = CURRENT_TIMESTAMP`,
        args: [
          data.id,
          data.name.trim(),
          data.region ?? null,
          Number.isFinite(Number(data.latitude))
            ? Number(data.latitude)
            : null,
          Number.isFinite(Number(data.longitude))
            ? Number(data.longitude)
            : null,
          data.difficulty ?? null,
          JSON.stringify(data),
        ],
      });
    }

    if (statements.length) {
      await db.batch(statements, "write");
    }

    res.json({
      success: true,
      message: "Trails synchronized successfully.",
      count: statements.length,
    });
  })
);

// FAVORITES: LIST
app.get(
  "/api/favorites",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: `SELECT t.data_json, t.id, t.name, t.region, t.latitude,
                   t.longitude, t.difficulty, f.created_at
            FROM favorites f
            JOIN trails t ON t.id = f.trail_id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC`,
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

// FAVORITES: ADD
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
      sql: `INSERT INTO favorites (user_id, trail_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, trail_id) DO NOTHING`,
      args: [req.userId, req.params.trailId],
    });

    res.json({
      success: true,
      message: "Trail added to favorites.",
    });
  })
);

// FAVORITES: REMOVE
app.delete(
  "/api/favorites/:trailId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    await db.execute({
      sql: "DELETE FROM favorites WHERE user_id = ? AND trail_id = ?",
      args: [req.userId, req.params.trailId],
    });

    res.json({
      success: true,
      message: "Favorite removed.",
    });
  })
);

// TRACKS: SAVE
app.post(
  "/api/tracks",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const {
      trailId = null,
      trailName = null,
      startedAt,
      endedAt,
      durationS,
      distanceM,
      ascentM = null,
      points,
    } = req.body || {};

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
      if (
        !point ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        point.latitude < -90 ||
        point.latitude > 90 ||
        point.longitude < -180 ||
        point.longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "Track contains invalid GPS points.",
        });
      }
    }

    const result = await db.execute({
      sql: `INSERT INTO tracks
            (user_id, trail_id, trail_name, started_at, ended_at,
             duration_s, distance_m, ascent_m, points_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        req.userId,
        typeof trailId === "string" ? trailId : null,
        typeof trailName === "string" ? trailName : null,
        startedAt,
        endedAt,
        durationS,
        distanceM,
        ascentM,
        JSON.stringify(points),
      ],
    });

    const saved = await db.execute({
      sql: "SELECT * FROM tracks WHERE id = ? AND user_id = ?",
      args: [Number(result.lastInsertRowid), req.userId],
    });

    res.status(201).json({
      success: true,
      track: parseTrack(saved.rows[0]),
    });
  })
);

// TRACKS: LIST
app.get(
  "/api/tracks",
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbReady;

    const result = await db.execute({
      sql: "SELECT * FROM tracks WHERE user_id = ? ORDER BY saved_at DESC",
      args: [req.userId],
    });

    res.json({
      success: true,
      tracks: result.rows.map(parseTrack),
    });
  })
);

// TRACKS: GET ONE
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
      sql: "SELECT * FROM tracks WHERE id = ? AND user_id = ?",
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

// TRACKS: DELETE
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
      sql: "DELETE FROM tracks WHERE id = ? AND user_id = ?",
      args: [id, req.userId],
    });

    res.json({
      success: true,
      deleted: Number(result.rowsAffected) > 0,
    });
  })
);

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found.",
  });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("API request failed:", error.message);

  if (res.headersSent) return next(error);

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
