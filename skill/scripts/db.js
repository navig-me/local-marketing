import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dataDir) {
  const dbPath = path.join(dataDir, "local-marketing.sqlite3");
  const isNew = !fs.existsSync(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  if (isNew) {
    const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    db.exec(schema);
  }
  return db;
}

export function ensureSchema(db) {
  const schema = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  db.exec(schema);
}
