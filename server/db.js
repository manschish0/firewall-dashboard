import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function initDb() {
  const db = await open({
    filename: "./data.sqlite",
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          device_ip TEXT NOT NULL,
          console_ip TEXT,
          enable_ping INTEGER DEFAULT 1,
          console_port INTEGER DEFAULT 23,
          description TEXT DEFAULT '',
          team TEXT DEFAULT 'Development',
          section TEXT DEFAULT '',
          owner TEXT DEFAULT '',
          location TEXT DEFAULT ''
    );


    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      start_time INTEGER NOT NULL,   -- epoch ms
      end_time INTEGER NOT NULL      -- epoch ms
    );

    CREATE TABLE IF NOT EXISTS device_status (
      device_id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
      is_up INTEGER NOT NULL DEFAULT 0,
      last_checked INTEGER NOT NULL DEFAULT 0,
      login_activity INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_name TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Add team column if it doesn't exist (migration for existing databases)
  try {
    await db.run(`ALTER TABLE devices ADD COLUMN team TEXT DEFAULT 'Development'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add section column if it doesn't exist (migration for existing databases)
  try {
    await db.run(`ALTER TABLE devices ADD COLUMN section TEXT DEFAULT ''`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add owner column if it doesn't exist (migration for existing databases)
  try {
    await db.run(`ALTER TABLE devices ADD COLUMN owner TEXT DEFAULT ''`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add location column if it doesn't exist (migration for existing databases)
  try {
    await db.run(`ALTER TABLE devices ADD COLUMN location TEXT DEFAULT ''`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Seed a few devices (run once)
  const row = await db.get(`SELECT COUNT(*) as c FROM devices`);
  if (row.c === 0) {
    const sample = [
      // Development Team - HiSecOS Section (Location: RACK13)
      {
        name: "40-03", device_ip: "", console_ip: "10.194.145.60", console_port: 1004,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-03", device_ip: "", console_ip: "10.194.145.60", console_port: 1005,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-03", device_ip: "", console_ip: "10.194.145.60", console_port: 1006,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-03_EM", device_ip: "", console_ip: "10.194.145.60", console_port: 1014,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-03_EM", device_ip: "", console_ip: "10.194.145.60", console_port: 1015,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-07", device_ip: "", console_ip: "10.194.145.100", console_port: 1035,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-07", device_ip: "", console_ip: "10.194.145.100", console_port: 1036,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "40-4F", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "Train-FW", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "HiSecOS", enable_ping: 1, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "PC (Window)", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "HiSecOS", enable_ping: 1, description: "",
        owner: "", location: "RACK13"
      },
      {
        name: "PC (Linux)", device_ip: "10.194.145.33", console_ip: "", console_port: 23,
        team: "Development", section: "HiSecOS", enable_ping: 0, description: "",
        owner: "", location: "RACK13"
      },

      // Development Team - PRISM Section (Location: RACK10)
      {
        name: "40-03 (STRCF)", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "PRISM", enable_ping: 0, description: "",
        owner: "", location: "RACK10"
      },
      {
        name: "40-4F (EATON)", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "PRISM", enable_ping: 0, description: "",
        owner: "", location: "RACK10"
      },
      {
        name: "PC (Linux)", device_ip: "", console_ip: "", console_port: 23,
        team: "Development", section: "PRISM", enable_ping: 0, description: "",
        owner: "", location: "RACK10"
      },

      // QA Team - Manual Section (Location: RACK11)
      {
        name: "40-03", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "40-03_EM", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "40-07", device_ip: "10.194.145.8", console_ip: "10.194.145.100", console_port: 10033,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "40-07", device_ip: "10.194.145.18", console_ip: "10.194.145.100", console_port: 10037,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "40-4F", device_ip: "10.194.145.12", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "Train FW", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 1, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "PC (Linux)", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },
      {
        name: "PC (Linux for TAFF)", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "manual", enable_ping: 0, description: "",
        owner: "", location: "RACK11"
      },

      // QA Team - Regression Section (Location: RACK12)
      {
        name: "20/30", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "regression", enable_ping: 1, description: "",
        owner: "", location: "RACK12"
      },
      {
        name: "40-03", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "regression", enable_ping: 0, description: "",
        owner: "", location: "RACK12"
      },
      {
        name: "40-03_EM", device_ip: "10.194.145.66", console_ip: "10.194.145.100", console_port: 10006,
        team: "QA", section: "regression", enable_ping: 0, description: "",
        owner: "", location: "RACK12"
      },
      {
        name: "40-07", device_ip: "10.194.145.38", console_ip: "10.194.145.100", console_port: 10037,
        team: "QA", section: "regression", enable_ping: 0, description: "",
        owner: "", location: "RACK12"
      },
      {
        name: "40-4F", device_ip: "10.194.145.23", console_ip: "10.194.145.100", console_port: 10041,
        team: "QA", section: "regression", enable_ping: 0, description: "",
        owner: "", location: "RACK12"
      },
      {
        name: "PC (Linux)", device_ip: "", console_ip: "", console_port: 23,
        team: "QA", section: "regression", enable_ping: 0, description: "",
        owner: "", location: "RACK12"
      }
    ];
    for (const d of sample) {
      const { lastID } = await db.run(
        `INSERT INTO devices (name, device_ip, console_ip, console_port, enable_ping, description, team, section, owner, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        d.name,
        d.device_ip,
        d.console_ip,
        d.console_port,
        d.enable_ping ?? 1,
        d.description,
        d.team || "Development",
        d.section || "",
        d.owner || "",
        d.location || ""
      );      
      await db.run(
        `INSERT INTO device_status (device_id, is_up, last_checked, login_activity) VALUES (?, 0, 0, 0)`,
        lastID
      );
    }
  }

  return db;
}
