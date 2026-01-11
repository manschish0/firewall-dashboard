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
          description TEXT DEFAULT ''
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
  `);

  // Seed a few devices (run once)
  const row = await db.get(`SELECT COUNT(*) as c FROM devices`);
  if (row.c === 0) {
    const sample = [
      {
        name: "40-07",
        device_ip: "10.0.0.12",
        console_ip: "10.10.1.5",
        console_port: 2001,
        description: "Edge test unit"
      }
      ,
      { name: "40-03", device_ip: "192.0.2.20", console_ip: "10.10.1.5", enable_ping: 0,
        console_port: 2201, description: "Perf lab" },
      { name: "40_EM", device_ip: "192.0.13.10", console_ip: "10.10.1.5", enable_ping: 0,
        console_port: 2501, description: "Staging rack" },
      { name: "404f", device_ip: "198.51.100.5", console_ip: "10.10.1.5", enable_ping: 1,
        console_port: 2101, description: "Feature branch" },
      { name: "Linux PC", device_ip: "127.0.0.1", console_ip: "-", enable_ping: 0,
        description: "Regression" }
    ];
    for (const d of sample) {
      const { lastID } = await db.run(
        `INSERT INTO devices (name, device_ip, console_ip, console_port, enable_ping, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        d.name,
        d.device_ip,
        d.console_ip,
        d.console_port,
        d.enable_ping ?? 1,
        d.description
      );      
      await db.run(
        `INSERT INTO device_status (device_id, is_up, last_checked, login_activity) VALUES (?, 0, 0, 0)`,
        lastID
      );
    }
  }

  return db;
}
