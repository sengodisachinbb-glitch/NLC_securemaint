// NLC-SecureMaint Seed Script
// Populates nlc.db with initial dummy users and equipment using parameterized queries

const bcrypt = require("bcrypt");
const db = require("./db");
const { validatePasswordPolicy } = require("./utils/passwordPolicy");

console.log("[Seed] Starting database seeding...");

// Default password for all dummy test accounts (must comply with password policy)
const DEFAULT_PASSWORD = "NlcSecure@2026!";

// Validate password policy before proceeding
const policyCheck = validatePasswordPolicy(DEFAULT_PASSWORD);
if (!policyCheck.valid) {
  console.error("[Seed] Fatal: Default password does not satisfy password policy:", policyCheck.error);
  process.exit(1);
}

const saltRounds = 10;
const defaultPasswordHash = bcrypt.hashSync(DEFAULT_PASSWORD, saltRounds);

// 1. Prepare 5 dummy users representing each system role
const users = [
  {
    name: "Rajesh Kumar (Admin)",
    email: "admin@nlc.in",
    password_hash: defaultPasswordHash,
    role: "Admin",
    section: "Central Administration",
  },
  {
    name: "Ananya Sharma (Manager)",
    email: "manager@nlc.in",
    password_hash: defaultPasswordHash,
    role: "Manager",
    section: "Mine-I Operations",
  },
  {
    name: "Suresh Murugan (Supervisor)",
    email: "supervisor@nlc.in",
    password_hash: defaultPasswordHash,
    role: "Supervisor",
    section: "Mechanical Maintenance",
  },
  {
    name: "Karthik Selvan (Technician)",
    email: "technician@nlc.in",
    password_hash: defaultPasswordHash,
    role: "Technician",
    section: "Electrical & Conveyor Systems",
  },
  {
    name: "Pooja Nair (Requester)",
    email: "requester@nlc.in",
    password_hash: defaultPasswordHash,
    role: "Requester",
    section: "Thermal Power Station-II",
  },
];

// 2. Prepare 10 dummy equipment items typical to NLCIL mines & thermal plants
const equipment = [
  {
    code: "BWE-01",
    name: "Bucket Wheel Excavator 1400L - Unit 1",
    type: "Excavator",
    location: "Mine-I / Face-A",
    section: "Mining",
    running_hours: 12500,
    service_life_hours: 50000,
    last_service_date: "2026-09-15",
  },
  {
    code: "BWE-02",
    name: "Bucket Wheel Excavator 700L - Unit 2",
    type: "Excavator",
    location: "Mine-IA / Bench-2",
    section: "Mining",
    running_hours: 8400,
    service_life_hours: 40000,
    last_service_date: "2026-10-01",
  },
  {
    code: "SPR-01",
    name: "Crawler Mounted Spreader 11000T/H",
    type: "Spreader",
    location: "Mine-I / Overburden Dump",
    section: "Overburden",
    running_hours: 14200,
    service_life_hours: 45000,
    last_service_date: "2026-08-20",
  },
  {
    code: "SPR-02",
    name: "High-Capacity Spreader 20000T/H",
    type: "Spreader",
    location: "Mine-II / Dump-Yard C",
    section: "Overburden",
    running_hours: 6300,
    service_life_hours: 45000,
    last_service_date: "2026-10-10",
  },
  {
    code: "CVY-01",
    name: "Main Overland Belt Conveyor 2400mm",
    type: "Conveyor",
    location: "Mine-I to TPS-I Transfer Line",
    section: "Conveyors",
    running_hours: 18900,
    service_life_hours: 60000,
    last_service_date: "2026-10-25",
  },
  {
    code: "CVY-02",
    name: "Shiftable Conveyor System Line-B",
    type: "Conveyor",
    location: "Mine-IA / Trunk Line",
    section: "Conveyors",
    running_hours: 9100,
    service_life_hours: 40000,
    last_service_date: "2026-09-05",
  },
  {
    code: "BLR-01",
    name: "Pulverized Lignite Boiler Unit 1",
    type: "Boiler",
    location: "TPS-II / Boiler House",
    section: "Thermal Power",
    running_hours: 22400,
    service_life_hours: 80000,
    last_service_date: "2026-07-12",
  },
  {
    code: "TRB-01",
    name: "Steam Turbine Generator 250MW",
    type: "Turbine",
    location: "TPS-II / Turbine Hall",
    section: "Thermal Power",
    running_hours: 21000,
    service_life_hours: 75000,
    last_service_date: "2026-06-30",
  },
  {
    code: "PMP-01",
    name: "Ash Slurry Disposal Pump 01",
    type: "Pump",
    location: "Ash Handling Plant / TPS-I",
    section: "Auxiliary",
    running_hours: 5800,
    service_life_hours: 25000,
    last_service_date: "2026-10-18",
  },
  {
    code: "TRF-01",
    name: "Main Step-Up Power Transformer 400kV",
    type: "Transformer",
    location: "Central Switchyard / Unit-3",
    section: "Electrical",
    running_hours: 31200,
    service_life_hours: 100000,
    last_service_date: "2026-05-14",
  },
];

// Parameterized insert / upsert queries to prevent SQL injection
const insertUser = db.prepare(`
  INSERT INTO users (name, email, password_hash, role, section)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    password_hash = excluded.password_hash,
    role = excluded.role,
    section = excluded.section
`);

const insertEquipment = db.prepare(`
  INSERT INTO equipment (code, name, type, location, section, running_hours, service_life_hours, last_service_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    type = excluded.type,
    location = excluded.location,
    section = excluded.section,
    running_hours = excluded.running_hours,
    service_life_hours = excluded.service_life_hours,
    last_service_date = excluded.last_service_date
`);

// Execute within a database transaction for consistency
const seedDatabase = db.transaction(() => {
  for (const user of users) {
    insertUser.run(user.name, user.email, user.password_hash, user.role, user.section);
  }

  for (const item of equipment) {
    insertEquipment.run(
      item.code,
      item.name,
      item.type,
      item.location,
      item.section,
      item.running_hours,
      item.service_life_hours,
      item.last_service_date
    );
  }

  // 3. Optional sample PM schedule seeding (if table empty)
  const pmCount = db.prepare("SELECT COUNT(*) as count FROM pm_schedules").get().count;
  if (pmCount === 0) {
    const eq1 = db.prepare("SELECT id FROM equipment WHERE code = ?").get("BWE-01");
    const eq2 = db.prepare("SELECT id FROM equipment WHERE code = ?").get("CVY-01");
    if (eq1) {
      db.prepare(`
        INSERT INTO pm_schedules (equipment_id, task, interval_days, next_due)
        VALUES (?, ?, ?, ?)
      `).run(
        eq1.id,
        "Inspect bucket wheel teeth and hydraulic pressure",
        2,
        new Date(Date.now() + 2 * 60 * 1000).toISOString()
      );
    }
    if (eq2) {
      db.prepare(`
        INSERT INTO pm_schedules (equipment_id, task, interval_days, next_due)
        VALUES (?, ?, ?, ?)
      `).run(
        eq2.id,
        "Ultrasonic roller bearing inspection and belt tension check",
        5,
        new Date(Date.now() + 5 * 60 * 1000).toISOString()
      );
    }
  }

  // 4. Optional sample compliance actions seeding (if table empty)
  const actionCount = db.prepare("SELECT COUNT(*) as count FROM actions").get().count;
  if (actionCount === 0) {
    const supervisor = db.prepare("SELECT id FROM users WHERE email = ?").get("supervisor@nlc.in");
    const technician = db.prepare("SELECT id FROM users WHERE email = ?").get("technician@nlc.in");

    if (supervisor) {
      db.prepare(`
        INSERT INTO actions (source, description, owner_id, due_date, status, evidence_note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "CAG Report 35 of 2025",
        "Implement continuous thermal imaging monitoring on high-capacity boiler feed pumps",
        supervisor.id,
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0],
        "In Progress",
        "Sensors procured from vendor, installation scheduled for next shutdown."
      );
    }

    if (technician) {
      db.prepare(`
        INSERT INTO actions (source, description, owner_id, due_date, status, evidence_note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "Incident review committee",
        "Install emergency pull-cord trip switches along shiftable conveyor system Line-B",
        technician.id,
        new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split("T")[0], // past due date
        "Open",
        null
      );
    }
  }
});

try {
  seedDatabase();
  console.log(`[Seed] Success! Seeded ${users.length} users and ${equipment.length} equipment items.`);
  console.log(`[Seed] Default password for all users: "${DEFAULT_PASSWORD}"`);
} catch (error) {
  console.error("[Seed] Error while seeding database:", error);
  process.exit(1);
}

