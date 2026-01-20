import pg from "pg";

const { Pool } = pg;

let db;

// Database wrapper to provide consistent interface
const dbWrapper = {
  // Run a query that may return a lastID (for INSERT)
  run: async (sql, ...params) => {
    // Convert SQLite-style placeholders (?) to PostgreSQL placeholders ($1, $2, etc.)
    let paramIndex = 1;
    let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // For INSERT queries, add RETURNING id if not already present
    // Only add RETURNING id for tables that have an 'id' column
    const isInsert = sql.toUpperCase().trim().startsWith('INSERT');
    let needsReturning = false;

    if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
      // Extract table name from INSERT statement
      // Pattern: INSERT INTO table_name ... or INSERT INTO schema.table_name ...
      const insertMatch = pgSql.match(/INSERT\s+INTO\s+(?:[\w.]+\.)?(\w+)/i);
      if (insertMatch) {
        const tableName = insertMatch[1].toLowerCase();
        // Only add RETURNING id for tables that have an 'id' column
        // devices, reservations, inventory have 'id' column
        // device_status uses 'device_id' as primary key, so skip it
        const tablesWithId = ['devices', 'reservations', 'inventory'];
        needsReturning = tablesWithId.includes(tableName);
      }
    }
    
    if (needsReturning) {
      // Remove trailing semicolon if present, add RETURNING id, then add semicolon back
      const trimmed = pgSql.trim();
      const hasSemicolon = trimmed.endsWith(';');
      const withoutSemicolon = hasSemicolon ? trimmed.slice(0, -1).trim() : trimmed;
      pgSql = withoutSemicolon + ' RETURNING id' + (hasSemicolon ? ';' : '');
    }
    
    try {
      const result = await db.query(pgSql, params);
      // PostgreSQL returns inserted row with RETURNING clause
      if (isInsert && result.rows && result.rows.length > 0 && result.rows[0].id !== undefined) {
        return { lastID: result.rows[0].id };
      }
      return { lastID: null };
    } catch (error) {
      console.error('Database query error:', error.message);
      console.error('SQL:', pgSql);
      console.error('Params:', params);
      throw error;
    }
  },

  // Get a single row
  get: async (sql, ...params) => {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await db.query(pgSql, params);
    return result.rows[0] || null;
  },

  // Get all rows
  all: async (sql, ...params) => {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await db.query(pgSql, params);
    return result.rows;
  }
};

export async function initDb() {
  // Require DATABASE_URL - PostgreSQL only
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is required. ' +
      'Please set it to your PostgreSQL connection string. ' +
      'For local development, you can use a local PostgreSQL instance or a cloud database.'
    );
  }

  console.log("Connecting to PostgreSQL database...");
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
      rejectUnauthorized: false
    }
  });
  
  // Test connection
  try {
    await db.query('SELECT NOW()');
    console.log("PostgreSQL connection established");
  } catch (error) {
    console.error("PostgreSQL connection error:", error);
    throw error;
  }

  // Create tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_status (
      device_id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
      is_up INTEGER NOT NULL DEFAULT 0,
      last_checked BIGINT NOT NULL DEFAULT 0,
      login_activity INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      device_name TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Add columns if they don't exist (migration for existing databases)
  const columnsToAdd = [
    { name: 'team', defaultValue: "'Development'" },
    { name: 'section', defaultValue: "''" },
    { name: 'owner', defaultValue: "''" },
    { name: 'location', defaultValue: "''" }
  ];

  for (const col of columnsToAdd) {
    try {
      await db.query(`ALTER TABLE devices ADD COLUMN ${col.name} TEXT DEFAULT ${col.defaultValue}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Seed devices ONLY if database is empty AND SEED_DATA environment variable is set to 'true'
  // This allows you to start with a clean database and add devices via admin UI
  const shouldSeed = process.env.SEED_DATA === 'true';
  
  if (shouldSeed) {
    const result = await db.query(`SELECT COUNT(*) as c FROM devices`);
    const row = result.rows[0];

    if (row.c === 0) {
      console.log("Database is empty and SEED_DATA=true. Seeding sample devices...");
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
        const result = await db.query(
          `INSERT INTO devices (name, device_ip, console_ip, console_port, enable_ping, description, team, section, owner, location)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
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
        const deviceId = result.rows[0].id;
        // Since ping is disabled, set is_up = 1 by default (device is available)
        // last_checked will be updated by the ping check job
        await db.query(
          `INSERT INTO device_status (device_id, is_up, last_checked, login_activity) VALUES ($1, 1, 0, 0)`,
          deviceId
        );
      }
      console.log(`Seeded ${sample.length} sample devices`);
    } else {
      console.log("Database already has devices. Skipping seed data.");
    }
  } else {
    console.log("SEED_DATA not set to 'true'. Skipping seed data. Add devices via admin UI.");
  }

  // Return the database wrapper
  return dbWrapper;
}
