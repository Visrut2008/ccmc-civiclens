import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing report id", { status: 400 });

  const row = await env.DB.prepare(
    "SELECT image_key FROM issues WHERE id = ?",
  ).bind(id).first<{ image_key: string | null }>();
  if (!row?.image_key) return new Response("Evidence not found", { status: 404 });

  const object = await env.EVIDENCE.get(row.image_key);
  if (!object) return new Response("Evidence not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
