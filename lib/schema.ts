import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
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
  /** Tournament: an on/off option on top of the matchup mode. */
  tournament: boolean("tournament").notNull().default(false),
  /** Tournament roster capacity per gender (powers of two). */
  maleSlots: integer("male_slots"),
  femaleSlots: integer("female_slots"),
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
  /**
   * Out: done for the night (injury, early leave) but still on the roster
   * and the leaderboard. No new games are generated for them; their queued
   * games are flagged for the organizer to clear and top up.
   */
  out: boolean("out").notNull().default(false),
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
  /** Tournament mode: which bracket round this game belongs to (1-based). */
  round: integer("round"),
  /** Bracket medal games: the championship final or the battle for 3rd. */
  stage: text("stage", { enum: ["final", "bronze"] }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  // One game on a court at a time. startGame's free-court pick is a
  // read-then-write on a driver without transactions; this is the guard
  // that makes two concurrent starts unable to share a court.
  uniqueIndex("games_one_playing_per_court")
    .on(t.sessionId, t.court)
    .where(sql`${t.status} = 'playing'`),
]);

export type Session = typeof sessions.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Rating = Player["rating"];
export type Gender = Player["gender"];
