import { env } from "cloudflare:workers";

const categories = [
  "Road damage",
  "Stormwater drain",
  "Garbage & sanitation",
  "Water supply",
  "Streetlight",
  "Sewage / UGD",
  "Public health",
  "Other civic issue",
];

export async function POST(request: Request) {
  const apiKey = (env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        configured: false,
        error: "Automatic photo analysis has not been connected yet.",
      },
      { status: 503 },
    );
  }

  const body = (await request.json()) as { imageData?: string };
  const match = body.imageData?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return Response.json({ error: "A valid camera image is required." }, { status: 400 });
  if (match[2].length > 10_500_000) {
    return Response.json({ error: "The photograph is too large for analysis." }, { status: 413 });
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: `Inspect this citizen-taken photograph for a municipal civic issue in Coimbatore.
Return whether the image is suitable evidence of a visible public-space problem. Reject selfies, indoor/private scenes, screenshots, documents, unrelated photos, and images where no civic issue is visible.
Classify valid evidence into exactly one allowed category. Describe only what is visibly supported; do not infer an address, ward, cause, owner, date, or severity not shown.`,
            },
            { inlineData: { mimeType: match[1], data: match[2] } },
          ],
        }],
        generationConfig: {
          responseFormat: {
            text: {
              mimeType: "application/json",
              schema: {
                type: "object",
                properties: {
                  validCivicIssue: { type: "boolean" },
                  category: { type: "string", enum: categories },
                  summary: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  rejectionReason: { type: "string" },
                },
                required: [
                  "validCivicIssue",
                  "category",
                  "summary",
                  "confidence",
                  "rejectionReason",
                ],
              },
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    return Response.json(
      { configured: true, error: "Photo analysis is temporarily unavailable." },
      { status: 502 },
    );
  }
  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) {
    return Response.json({ configured: true, error: "No classification was returned." }, { status: 502 });
  }

  try {
    const result = JSON.parse(text);
    return Response.json({ configured: true, result });
  } catch {
    return Response.json({ configured: true, error: "The classification response was invalid." }, { status: 502 });
  }
}
