import express from "express";
import cors from "cors";
import cron from "node-cron";
import ping from "ping";
import { initDb } from "./db.js";

const app = express();
// CORS configuration - allow requests from frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

const db = await initDb();

/* ---------- Helpers ---------- */
function nowMs() { return Date.now(); }
function msToHMS(ms) {
  if (ms <= 0) return "Now";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / (60*24));
  const h = Math.floor((m % (60*24)) / 60);
  const mi = m % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (mi) parts.push(`${mi}m`);
  return parts.join(" ") || "Now";
}

async function computeRow(d) {
  const status = await db.get(
    `SELECT is_up, last_checked, login_activity FROM device_status WHERE device_id = ?`,
    d.id
  );
  const activeRes = await db.get(
    `SELECT * FROM reservations
     WHERE device_id = ? AND start_time <= ? AND end_time > ?
     ORDER BY end_time DESC LIMIT 1`,
    d.id, nowMs(), nowMs()
  );

  // Ping is currently disabled - all devices are treated as "up" (available)
  // When ping is re-enabled, this will check enable_ping flag and actual ping status
  const isUp = !!(status?.is_up); // All devices set to is_up = 1 since ping is disabled
  const loginActivity = !!(status?.login_activity); // optional source

  let availability, nextAvailableTime;
  let reservedBy = "—";

  if (!isUp) {
    availability = "Not Available";
    nextAvailableTime = "—";
    reservedBy = "—";
  } else if (activeRes) {
    // Active reservation - device is in use
    availability = "In Use";
    nextAvailableTime = msToHMS(activeRes.end_time - nowMs());
    reservedBy = activeRes.user_name || "—";
  } else {
    // No active reservation - device is available
    // Explicitly set reservedBy to "—" when no active reservation
    availability = "Available";
    nextAvailableTime = "Now";
    reservedBy = "—";
  }

  // Format telnet string - show "—" if console_ip is empty
  const telnetStr = d.console_ip && d.console_ip.trim() 
    ? `telnet ${d.console_ip} ${d.console_port}` 
    : "—";

  return {
    id: d.id,
    name: d.name,
    deviceIp: d.device_ip || "—",
    telnet: telnetStr,
    status: isUp ? "Up" : "Down",
    reservedBy: reservedBy,
    loginActivity: isUp ? (loginActivity ? "Yes" : "No") : "—",
    availability,
    nextAvailableTime,
    team: d.team || "Development",
    section: d.section || "",
    owner: d.owner || "",
    location: d.location || ""
  };    
}

/* ---------- API ---------- */

// List devices with computed fields
app.get("/api/devices", async (_req, res) => {
  const devices = await db.all(`SELECT * FROM devices ORDER BY id ASC`);
  const rows = await Promise.all(devices.map(computeRow));
  res.json(rows);
});

// Get inventory data
app.get("/api/inventory", async (_req, res) => {
  try {
    const inventory = await db.all(`SELECT device_name, count FROM inventory ORDER BY device_name ASC`);
    res.json(inventory);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create reservation for duration (days/hours/minutes)
app.post("/api/reserve", async (req, res) => {
  try {
    const { device_id, user_name, days = 0, hours = 0, minutes = 0 } = req.body;
    const device = await db.get(`SELECT * FROM devices WHERE id = ?`, device_id);
    if (!device) return res.status(404).json({ error: "Device not found" });

    const st = await db.get(
      `SELECT is_up FROM device_status WHERE device_id = ?`,
      device_id
    );
    if (!st?.is_up) return res.status(400).json({ error: "Device is Down" });

    const active = await db.get(
      `SELECT 1 FROM reservations WHERE device_id = ? AND start_time <= ? AND end_time > ?`,
      device_id, nowMs(), nowMs()
    );
    if (active) return res.status(400).json({ error: "Device already reserved" });

    const durationMs = ((+days)*24*60 + (+hours)*60 + (+minutes)) * 60 * 1000;
    if (!durationMs) return res.status(400).json({ error: "Duration cannot be zero" });

    const start = nowMs();
    const end = start + durationMs;

    await db.run(
      `INSERT INTO reservations (device_id, user_name, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      device_id, user_name, start, end
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Release current reservation immediately
app.post("/api/release", async (req, res) => {
    const { device_id, user_name } = req.body;
  
    // Find the active reservation
    const active = await db.get(
      `SELECT * FROM reservations 
       WHERE device_id = ? AND start_time <= ? AND end_time > ?`,
      device_id, nowMs(), nowMs()
    );
  
    if (!active) return res.status(400).json({ error: "No active reservation" });
  
    if (active.user_name !== user_name) {
      return res.status(403).json({ error: "Only the person who reserved can release" });
    }
  
    await db.run(
      `UPDATE reservations SET end_time = ? WHERE id = ?`,
      nowMs(), active.id
    );
  
    res.json({ ok: true });
  });
  

// (Optional) toggle login activity for demo
app.post("/api/login-activity", async (req, res) => {
  const { device_id, active } = req.body;
  await db.run(
    `UPDATE device_status SET login_activity = ?, last_checked = ? WHERE device_id = ?`,
    active ? 1 : 0, nowMs(), device_id
  );
  res.json({ ok: true });
});

// Admin code verification
// Default admin code is "admin123" - can be changed via environment variable
const ADMIN_CODE = process.env.ADMIN_CODE || "admin123";
app.post("/api/admin/verify", async (req, res) => {
  try {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
      res.json({ ok: true, message: "Admin access granted" });
    } else {
      res.status(401).json({ error: "Invalid admin code" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create new device (admin only)
app.post("/api/devices", async (req, res) => {
  try {
    const { name, device_ip, console_ip, console_port, team, section, enable_ping, description, owner, location } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Device name is required" });
    }

    const { lastID } = await db.run(
      `INSERT INTO devices (name, device_ip, console_ip, console_port, enable_ping, description, team, section, owner, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name || "",
      device_ip || "",
      console_ip || "",
      console_port || 23,
      enable_ping !== undefined ? enable_ping : 1,
      description || "",
      team || "Development",
      section || "",
      owner || "",
      location || ""
    );

    // Initialize device status
    await db.run(
      `INSERT INTO device_status (device_id, is_up, last_checked, login_activity) VALUES (?, 0, 0, 0)`,
      lastID
    );

    res.json({ ok: true, id: lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update device (admin only)
app.put("/api/devices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, device_ip, console_ip, console_port, team, section, enable_ping, description, owner, location } = req.body;

    const device = await db.get(`SELECT * FROM devices WHERE id = ?`, id);
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Only update fields that are provided in the request
    // Allow empty strings to be set (for clearing values)
    await db.run(
      `UPDATE devices 
       SET name = ?, device_ip = ?, console_ip = ?, console_port = ?, enable_ping = ?, 
           description = ?, team = ?, section = ?, owner = ?, location = ?
       WHERE id = ?`,
      name !== undefined ? name : device.name,
      device_ip !== undefined ? (device_ip === null ? "" : device_ip) : device.device_ip,
      console_ip !== undefined ? (console_ip === null ? "" : console_ip) : device.console_ip,
      console_port !== undefined ? (console_port || 23) : device.console_port,
      enable_ping !== undefined ? enable_ping : device.enable_ping,
      description !== undefined ? description : device.description,
      team !== undefined ? team : device.team,
      section !== undefined ? section : device.section,
      owner !== undefined ? owner : device.owner,
      location !== undefined ? location : device.location,
      id
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete device (admin only)
app.delete("/api/devices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const device = await db.get(`SELECT * FROM devices WHERE id = ?`, id);
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Delete device (cascade will handle device_status and reservations)
    await db.run(`DELETE FROM devices WHERE id = ?`, id);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Ping job: updates Up/Down ---------- */
// DISABLED: Ping feature is currently disabled. Can be re-enabled in the future.
// To re-enable: Uncomment the ping.promise.probe calls and the cron schedule below.
async function runPingCheck() {
  const devices = await db.all(`SELECT * FROM devices`);
  for (const d of devices) {
    // Ping is disabled - treat all devices as "up" (available)
    // This allows devices to be reserved regardless of actual network connectivity
    await db.run(
      `UPDATE device_status SET is_up = 1, last_checked = ? WHERE device_id = ?`,
      nowMs(), d.id
    );

    // DISABLED: Actual ping check - uncomment to re-enable ping functionality
    /*
    if (d.enable_ping === 0) {
      await db.run(
        `UPDATE device_status SET is_up = 1, last_checked = ? WHERE device_id = ?`,
        nowMs(), d.id
      );
      continue;
    }
  
    try {
      const resp = await ping.promise.probe(d.device_ip, { timeout: 2 });
      await db.run(
        `UPDATE device_status SET is_up = ?, last_checked = ? WHERE device_id = ?`,
        resp.alive ? 1 : 0,
        nowMs(),
        d.id
      );
    } catch {
      await db.run(
        `UPDATE device_status SET is_up = 0, last_checked = ? WHERE device_id = ?`,
        nowMs(),
        d.id
      );
    }
    */
  }
  
  console.log("Device status updated (ping disabled)", new Date().toISOString());
}

// Run status check immediately on startup (sets all devices as available)
runPingCheck();

// DISABLED: Cron schedule for ping checks - uncomment to re-enable automatic ping
// cron.schedule("* * * * *", runPingCheck);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
