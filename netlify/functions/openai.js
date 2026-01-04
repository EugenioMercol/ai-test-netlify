// netlify/functions/openai.js  (CommonJS)
// Diagnóstico: diferencia si falla descarga de imagen o llamada a OpenAI.

function toDataUrl(base64, mime) {
  const clean = String(base64 || "").replace(/^data:.*;base64,/, "").trim();
  return `data:${mime};base64,${clean}`;
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function downloadToDataUrl(imageUrl) {
  // Importante: si tu servidor bloquea IPs de datacenter, acá puede explotar con "fetch failed"
  const resp = await fetchWithTimeout(
    imageUrl,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*,*/*;q=0.8",
      },
    },
    20000
  );

  if (!resp.ok) {
    const ct = resp.headers.get("content-type") || "";
    let body = "";
    try { body = await resp.text(); } catch {}
    throw new Error(`image_url responded ${resp.status}. content-type=${ct}. body_snippet=${body.slice(0, 200)}`);
  }

  const contentType = resp.headers.get("content-type") || "image/png";
  const ab = await resp.arrayBuffer();
  const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "Missing OPENAI_API_KEY env var" };

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    const imageMime = (payload.image_mime || "image/png").trim();
    const imageUrl = (payload.image_url || "").trim();
    const imageBase64 = (payload.image_base64 || "").trim();

    // 1) Obtener imagen como dataURL
    let imageDataUrl = "";
    if (imageBase64) {
      imageDataUrl = imageBase64.startsWith("data:") ? imageBase64 : toDataUrl(imageBase64, imageMime);
    } else if (imageUrl) {
      try {
        imageDataUrl = await downloadToDataUrl(imageUrl);
      } catch (e) {
        // Si tu WAF bloquea Netlify/AWS, vas a caer acá.
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            stage: "image_download",
            message: "Failed downloading image_url from Netlify",
            image_url: imageUrl,
            error: String(e && e.message ? e.message : e),
          }),
        };
      }
    } else {
      return { statusCode: 400, body: "Missing image_base64 or image_url" };
    }

    // ===== Schema Step2 + Step5 (tus campos) =====
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "step2", "step5"],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        step2: {
          type: "object",
          additionalProperties: false,
          required: ["productInformation"],
          properties: {
            productInformation: {
              type: "object",
              additionalProperties: false,
              required: ["group1","detailedProductDescription","generalInformation","productUses","productMaterials"],
              properties: {
                group1: {
                  type: "object",
                  additionalProperties: false,
                  required: ["productDescription","productName","productBrand","productUseAndApplication"],
                  properties: {
                    productDescription: { type: "string", description: "Máx 30. Si no, ''." },
                    productName: { type: "string", description: "Máx 20. Si no se ve, ''." },
                    productBrand: { type: "string", description: "Máx 20. Si no se ve, ''." },
                    productUseAndApplication: { type: "string", description: "Máx 100. Si duda, ''." },
                  },
                },
                detailedProductDescription: {
                  type: "object",
                  additionalProperties: false,
                  required: ["productDescriptionExtended"],
                  properties: {
                    productDescriptionExtended: { type: "string", description: "Máx 600. Genérico coherente. No inventes." },
                  },
                },
                generalInformation: {
                  type: "object",
                  additionalProperties: false,
                  required: ["isElectric"],
                  properties: { isElectric: { type: "boolean", description: "true solo con evidencia; si no, false." } },
                },
                productUses: {
                  type: "object",
                  additionalProperties: false,
                  required: ["foodContact"],
                  properties: { foodContact: { type: "boolean", description: "true solo si es claro; si no, false." } },
                },
                productMaterials: {
                  type: "object",
                  additionalProperties: false,
                  required: ["containsPaper","containsGlass","containsMetal","containsTextiles","containsBiodegradableMaterial"],
                  properties: {
                    containsPaper: { type: "boolean" },
                    containsGlass: { type: "boolean" },
                    containsMetal: { type: "boolean" },
                    containsTextiles: { type: "boolean" },
                    containsBiodegradableMaterial: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
        step5: {
          type: "object",
          additionalProperties: false,
          required: ["productInfo"],
          properties: {
            productInfo: {
              type: "object",
              additionalProperties: false,
              required: ["productWarning"],
              properties: {
                productWarning: {
                  type: "object",
                  additionalProperties: false,
                  required: ["productWarning"],
                  properties: {
                    productWarning: { type: "string", description: "Máx 600. Riesgos/prohibiciones/cuidados genéricos." },
                  },
                },
              },
            },
          },
        },
      },
    };

    const instructions =
      "Devuelve SOLO JSON válido que cumpla exactamente el schema. Español. " +
      "No inventes. Strings: '' si no se puede determinar. Booleanos: true solo con evidencia clara; si no, false. " +
      "Límites: productDescription<=30, productName<=20, productBrand<=20, productUseAndApplication<=100, productDescriptionExtended<=600, productWarning<=600. " +
      "Sin saltos de línea. Solo JSON.";

    const openaiBody = {
      model: "gpt-4o-2024-08-06",
      instructions,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Completa los campos a partir de la imagen del producto." },
          { type: "input_image", image_url: imageDataUrl },
        ],
      }],
      text: { format: { type: "json_schema", strict: true, name: "certiverso_autofill_v1", schema } },
    };

    // 2) Llamada a OpenAI
    let resp;
    try {
      resp = await fetchWithTimeout(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(openaiBody),
        },
        30000
      );
    } catch (e) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          stage: "openai_call",
          message: "Failed calling OpenAI from Netlify",
          error: String(e && e.message ? e.message : e),
        }),
      };
    }

    const raw = await resp.text();

    // devolver JSON limpio si existe output_text
    try {
      const parsed = JSON.parse(raw);
      const outText = parsed && parsed.output_text;
      if (typeof outText === "string" && outText.trim()) {
        return {
          statusCode: resp.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: outText,
        };
      }
    } catch {}

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: raw,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ stage: "unknown", error: String(e && e.message ? e.message : e) }),
    };
  }
};
