import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  ward: text("ward").notNull(),
  zone: text("zone").notNull(),
  address: text("address").notNull(),
  department: text("department").notNull(),
  status: text("status").notNull().default("RECEIVED"),
  priority: text("priority").notNull().default("To be assessed"),
  votes: integer("votes").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  reporter: text("reporter").notNull().default("Citizen report"),
  createdAt: text("created_at").notNull(),
  dueAt: text("due_at").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  progress: integer("progress").notNull().default(0),
  assignee: text("assignee"),
  imageKey: text("image_key"),
  gpsAccuracy: real("gps_accuracy"),
  aiConfidence: real("ai_confidence"),
  aiSummary: text("ai_summary"),
  classificationSource: text("classification_source").notNull().default("citizen-confirmed"),
});

export const ticketEvents = sqliteTable("ticket_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  issueId: text("issue_id").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const reactions = sqliteTable("reactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  issueId: text("issue_id").notNull(),
  citizenId: text("citizen_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: text("created_at").notNull(),
});
