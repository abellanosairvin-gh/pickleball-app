import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "ended"] })
    .notNull()
    .default("active"),
  courtCount: integer("court_count").notNull(),
  gameCap: integer("game_cap").notNull(),
  defaultMode: text("default_mode", {
    enum: ["random", "rating", "fixed", "ladder"],
  })
    .notNull()
    .default("random"),
  publicToken: text("public_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  name: text("name").notNull(),
  gender: text("gender", { enum: ["M", "F"] }).notNull(),
  rating: text("rating", { enum: ["beginner", "mid", "advanced"] }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  seq: integer("seq").notNull(),
  queueOrder: integer("queue_order").notNull().default(0),
  status: text("status", { enum: ["queued", "playing", "completed"] })
    .notNull()
    .default("queued"),
  court: integer("court"),
  t1p1: integer("t1p1").notNull(),
  t1p2: integer("t1p2").notNull(),
  t2p1: integer("t2p1").notNull(),
  t2p2: integer("t2p2").notNull(),
  score1: integer("score1"),
  score2: integer("score2"),
  pinned: boolean("pinned").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Session = typeof sessions.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Rating = Player["rating"];
export type Gender = Player["gender"];
