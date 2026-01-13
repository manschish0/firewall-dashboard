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

  // If ping is disabled, treat device as always up
  const isUp = d.enable_ping === 0 ? true : !!(status?.is_up);
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

/* ---------- Ping job: updates Up/Down ---------- */
// Runs every minute. Replace with your internal management probe if you prefer.
async function runPingCheck() {
  const devices = await db.all(`SELECT * FROM devices`);
  for (const d of devices) {

    // 🔹 NEW: skip ping if disabled
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
  }
  
  console.log("Ping cycle done", new Date().toISOString());
}

// Run ping check immediately on startup
runPingCheck();

// Schedule ping check every minute
cron.schedule("* * * * *", runPingCheck);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
