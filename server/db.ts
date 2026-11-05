import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "./config";

export const DATA_DIR = path.resolve(config.dataDir);
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "draw.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export const newId = () => nanoid(21);
export const now = () => new Date().toISOString();

/** Application tables (better-auth manages user/session/account/verification). */
export function migrateApp() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS app_setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS folder (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    parentId TEXT,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS board (
    id TEXT PRIMARY KEY,
    creatorId TEXT NOT NULL,
    folderId TEXT,
    title TEXT NOT NULL,
    thumbnailVersion INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private',
    shareToken TEXT,
    shareRole TEXT NOT NULL DEFAULT 'view',
    version INTEGER NOT NULL DEFAULT 0,
    currentVersionId TEXT,
    lastEditedBy TEXT,
    lastEditedAt TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS board_creator ON board(creatorId);
  CREATE UNIQUE INDEX IF NOT EXISTS board_token ON board(shareToken);
  CREATE TABLE IF NOT EXISTS board_page (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    elements TEXT NOT NULL DEFAULT '[]',
    appState TEXT NOT NULL DEFAULT '{}',
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS board_file (
    id TEXT NOT NULL,
    boardId TEXT NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    mimeType TEXT NOT NULL,
    dataURL TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (boardId, id)
  );
  CREATE TABLE IF NOT EXISTS board_version (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    auto INTEGER NOT NULL DEFAULT 0,
    snapshot TEXT NOT NULL,
    createdBy TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS board_activity (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL,
    userId TEXT NOT NULL,
    kind TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_time ON board_activity(createdAt);
  CREATE TABLE IF NOT EXISTS comment (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    pageId TEXT,
    parentId TEXT,
    userId TEXT NOT NULL,
    body TEXT NOT NULL,
    x REAL,
    y REAL,
    elementId TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_key (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    start TEXT NOT NULL,
    keyHash TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    expiresAt TEXT,
    lastUsedAt TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    planId TEXT NOT NULL,
    planName TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'pending',
    channel TEXT NOT NULL DEFAULT 'mock',
    outTradeNo TEXT NOT NULL,
    channelTradeNo TEXT,
    qrcode TEXT,
    metadata TEXT,
    paidAt TEXT,
    expiresAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS code_library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    packageName TEXT,
    version TEXT,
    globalName TEXT,
    modules TEXT,
    files TEXT NOT NULL DEFAULT '[]',
    builtin INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    mirrored INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS code_stack (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    runtime TEXT NOT NULL,
    libraryIds TEXT NOT NULL DEFAULT '[]',
    starter TEXT,
    prompt TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS code_font (
    id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    displayName TEXT,
    category TEXT NOT NULL DEFAULT 'sans',
    source TEXT NOT NULL DEFAULT 'url',
    url TEXT,
    css TEXT,
    files TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    mirrored INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  `);
}

migrateApp();

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM app_setting WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(key: string, value: unknown) {
  db.prepare("INSERT INTO app_setting(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value),
  );
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
