export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "Missing OPENAI_API_KEY env var" };

    const { image_url } = JSON.parse(event.body || "{}");
    if (!image_url) return { statusCode: 400, body: "Missing image_url" };

    const body = {
      model: "gpt-4o-2024-08-06",
      instructions:
        'Devuelve SOLO JSON válido según el schema. Español. No inventes. Strings: "" si no se deduce. Booleanos: true solo con evidencia visible; si no, false.',
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Autocompleta campos desde la imagen." },
          { type: "input_image", image_url }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: "certiverso_test_v1",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["productDescription", "isElectric"],
            properties: {
              productDescription: { type: "string", description: 'Máx 30 caracteres. Si no se deduce, "".' },
              isElectric: { type: "boolean", description: "true solo con evidencia visible; si no, false." }
            }
          }
        }
      }
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const text = await resp.text();
    return { statusCode: resp.status, headers: { "Content-Type": "application/json" }, body: text };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
}
