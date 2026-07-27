import { env } from "cloudflare:workers";

type IssueRow = Record<string, unknown>;

const VALID_CATEGORIES = new Set([
  "Road damage",
  "Stormwater drain",
  "Garbage & sanitation",
  "Water supply",
  "Streetlight",
  "Sewage / UGD",
  "Public health",
  "Other civic issue",
]);

async function initialize() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      ward TEXT NOT NULL,
      zone TEXT NOT NULL,
      address TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      priority TEXT NOT NULL DEFAULT 'To be assessed',
      votes INTEGER NOT NULL DEFAULT 0,
      followers INTEGER NOT NULL DEFAULT 0,
      reporter TEXT NOT NULL DEFAULT 'Citizen report',
      created_at TEXT NOT NULL,
      due_at TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      assignee TEXT,
      image_key TEXT,
      gps_accuracy REAL,
      ai_confidence REAL,
      ai_summary TEXT,
      classification_source TEXT NOT NULL DEFAULT 'citizen-confirmed'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS issues_ward_idx ON issues (ward)"),
    db.prepare("CREATE INDEX IF NOT EXISTS issues_category_idx ON issues (category)"),
    db.prepare("CREATE INDEX IF NOT EXISTS issues_created_idx ON issues (created_at)"),
  ]);
}

function rowToIssue(row: IssueRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    ward: Number(String(row.ward).replace(/\D/g, "")),
    zone: row.zone,
    address: row.address,
    department: row.department,
    status: row.status,
    createdAt: row.created_at,
    latitude: row.latitude,
    longitude: row.longitude,
    gpsAccuracy: row.gps_accuracy,
    aiConfidence: row.ai_confidence,
    aiSummary: row.ai_summary,
    classificationSource: row.classification_source,
    imageUrl: row.image_key ? `/api/evidence?id=${encodeURIComponent(String(row.id))}` : "",
  };
}

export async function GET() {
  await initialize();
  const result = await env.DB.prepare(
    "SELECT * FROM issues ORDER BY created_at DESC LIMIT 500",
  ).all<IssueRow>();
  return Response.json({
    issues: (result.results ?? []).map(rowToIssue),
    source: "citizen-submitted",
  });
}

export async function POST(request: Request) {
  await initialize();
  const body = (await request.json()) as Record<string, unknown>;

  const category = String(body.category || "");
  const ward = Number(body.ward);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const gpsAccuracy = Number(body.gpsAccuracy);
  const dataUrl = String(body.imageData || "");
  const mimeMatch = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);

  if (!VALID_CATEGORIES.has(category)) {
    return Response.json({ error: "Select a valid civic issue category." }, { status: 400 });
  }
  if (!Number.isInteger(ward) || ward < 1 || ward > 100) {
    return Response.json({ error: "A verified CCMC ward is required." }, { status: 400 });
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(gpsAccuracy)) {
    return Response.json({ error: "Verified device GPS is required." }, { status: 400 });
  }
  if (!mimeMatch) {
    return Response.json({ error: "A camera photograph is required." }, { status: 400 });
  }
  if (mimeMatch[2].length > 10_500_000) {
    return Response.json({ error: "The photograph is too large." }, { status: 413 });
  }

  const now = new Date();
  const id = `CBE-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const extension = mimeMatch[1] === "image/png" ? "png" : mimeMatch[1] === "image/webp" ? "webp" : "jpg";
  const imageKey = `reports/${now.getUTCFullYear()}/${id}.${extension}`;
  const bytes = Uint8Array.from(atob(mimeMatch[2]), (character) => character.charCodeAt(0));

  await env.EVIDENCE.put(imageKey, bytes, {
    httpMetadata: { contentType: mimeMatch[1] },
    customMetadata: { issueId: id, ward: String(ward) },
  });

  const title = String(body.title || `${category} reported by citizen`).slice(0, 120);
  const description = String(body.description || "Photographic civic report.").slice(0, 1000);
  const zone = String(body.zone || "");
  const area = String(body.area || "");
  const department = String(body.department || "");
  const assignee = String(body.assignee || "");
  const aiConfidence = body.aiConfidence == null ? null : Number(body.aiConfidence);
  const aiSummary = String(body.aiSummary || "").slice(0, 500);
  const classificationSource = String(body.classificationSource || "citizen-confirmed");

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO issues
      (id,title,description,category,ward,zone,address,department,status,priority,votes,followers,reporter,created_at,due_at,image_url,latitude,longitude,progress,assignee,image_key,gps_accuracy,ai_confidence,ai_summary,classification_source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id, title, description, category, String(ward), zone, area, department,
        "RECEIVED", "To be assessed", 0, 0, "Citizen report", now.toISOString(), "",
        "", latitude, longitude, 0, assignee, imageKey, gpsAccuracy,
        Number.isFinite(aiConfidence) ? aiConfidence : null,
        aiSummary || null, classificationSource,
      ),
    env.DB.prepare(
      "INSERT INTO ticket_events (issue_id,event_type,actor,message,created_at) VALUES (?,?,?,?,?)",
    ).bind(
      id,
      "RECEIVED",
      "Citizen",
      "Photo, GPS coordinates and routing information recorded.",
      now.toISOString(),
    ),
  ]);

  return Response.json({
    issue: {
      id,
      title,
      description,
      category,
      ward,
      zone,
      address: area,
      department,
      status: "RECEIVED",
      createdAt: now.toISOString(),
      latitude,
      longitude,
      gpsAccuracy,
      aiConfidence: Number.isFinite(aiConfidence) ? aiConfidence : null,
      aiSummary: aiSummary || null,
      classificationSource,
      imageUrl: `/api/evidence?id=${encodeURIComponent(id)}`,
    },
  }, { status: 201 });
}
