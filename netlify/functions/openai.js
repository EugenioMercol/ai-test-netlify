// netlify/functions/openai.js
// Acepta:
// - image_base64: data URL (data:image/...;base64,...) o base64 pelado
// - image_url: URL pública (la function la descarga y la convierte a base64)
// Devuelve JSON estructurado (schema fijo) vía OpenAI Responses API.

function toDataUrl({ base64, mime }) {
  const clean = (base64 || "").replace(/^data:.*;base64,/, "").trim();
  return `data:${mime};base64,${clean}`;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, "binary").toString("base64");
}

export async function handler(event) {
  try {
    // CORS
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

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "Missing OPENAI_API_KEY env var" };

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    const imageMimeDefault = (payload.image_mime || "image/png").trim();
    const imageUrl = (payload.image_url || "").trim();
    let imageBase64 = (payload.image_base64 || "").trim();

    // 1) Si viene base64, lo usamos.
    // 2) Si NO viene base64 pero viene URL, la function descarga y convierte a base64.
    if (!imageBase64) {
      if (!imageUrl) {
        return { statusCode: 400, body: "Missing image_base64 or image_url" };
      }

      // Descargar imagen desde la function (no desde OpenAI)
      const imgResp = await fetch(imageUrl, {
        // headers suaves por si tu server es quisquilloso
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "image/*,*/*;q=0.8",
        },
      });

      if (!imgResp.ok) {
        const msg = `Could not download image_url (status ${imgResp.status})`;
        return { statusCode: 400, body: msg };
      }

      const contentType = imgResp.headers.get("content-type") || imageMimeDefault;
      const ab = await imgResp.arrayBuffer();
      const b64 = arrayBufferToBase64(ab);
      imageBase64 = `data:${contentType};base64,${b64}`;
    } else {
      // Normalizar base64 a data URL si viene "pelado"
      if (!imageBase64.startsWith("data:")) {
        imageBase64 = toDataUrl({ base64: imageBase64, mime: imageMimeDefault });
      }
    }

    // ====== Schema Step2 + Step5 ======
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
              required: [
                "group1",
                "detailedProductDescription",
                "generalInformation",
                "productUses",
                "productMaterials",
              ],
              properties: {
                group1: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "productDescription",
                    "productName",
                    "productBrand",
                    "productUseAndApplication",
                  ],
                  properties: {
                    productDescription: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productDescription. Máx 30 caracteres. Si no se deduce sin inventar, ''. Sin saltos de línea.",
                    },
                    productName: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productName. Máx 20 caracteres. Solo si se ve en la imagen; si no, ''.",
                    },
                    productBrand: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productBrand. Máx 20 caracteres. Solo si se ve en la imagen; si no, ''.",
                    },
                    productUseAndApplication: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productUseAndApplication. Máx 100 caracteres. Uso breve coherente; si hay duda, ''.",
                    },
                  },
                },

                detailedProductDescription: {
                  type: "object",
                  additionalProperties: false,
                  required: ["productDescriptionExtended"],
                  properties: {
                    productDescriptionExtended: {
                      type: "string",
                      description:
                        "step2.productInformation.detailedProductDescription.productDescriptionExtended. Máx 600 caracteres. Descripción detallada coherente. No inventes datos técnicos/certificaciones. Sin saltos de línea.",
                    },
                  },
                },

                generalInformation: {
                  type: "object",
                  additionalProperties: false,
                  required: ["isElectric"],
                  properties: {
                    isElectric: {
                      type: "boolean",
                      description:
                        "step2.productInformation.generalInformation.isElectric. true SOLO con evidencia visible; si no, false.",
                    },
                  },
                },

                productUses: {
                  type: "object",
                  additionalProperties: false,
                  required: ["foodContact"],
                  properties: {
                    foodContact: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productUses.foodContact. true SOLO si es claramente para alimentos/bebidas; si no, false.",
                    },
                  },
                },

                productMaterials: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "containsPaper",
                    "containsGlass",
                    "containsMetal",
                    "containsTextiles",
                    "containsBiodegradableMaterial",
                  ],
                  properties: {
                    containsPaper: { type: "boolean", description: "true SOLO si se ve papel/cartón; si duda, false." },
                    containsGlass: { type: "boolean", description: "true SOLO si se ve vidrio; si duda, false." },
                    containsMetal: { type: "boolean", description: "true SOLO si se ve metal; si duda, false." },
                    containsTextiles: { type: "boolean", description: "true SOLO si se ve textil; si duda, false." },
                    containsBiodegradableMaterial: {
                      type: "boolean",
                      description: "true SOLO con evidencia clara (visible/etiqueta); si duda, false.",
                    },
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
                    productWarning: {
                      type: "string",
                      description:
                        "step5.productInfo.productWarning.productWarning. Máx 600 caracteres. Riesgos, prohibiciones y cuidados genéricos coherentes. Sin inventar datos. Sin saltos de línea.",
                    },
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
      "Cuenta caracteres incluyendo espacios. Reformula para cumplir. Sin saltos de línea. Sin markdown. Solo JSON.";

    const openaiBody = {
      model: "gpt-4o-2024-08-06",
      instructions,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Completa los campos a partir de la imagen del producto." },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: "certiverso_autofill_v1",
          schema,
        },
      },
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiBody),
    });

    const raw = await resp.text();

    // Intentar devolver JSON "limpio"
    try {
      const parsed = JSON.parse(raw);
      const outText = parsed?.output_text;
      if (typeof outText === "string" && outText.trim()) {
        try {
          const finalObj = JSON.parse(outText);
          return {
            statusCode: resp.status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(finalObj),
          };
        } catch {
          return {
            statusCode: resp.status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: outText,
          };
        }
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
      headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
      body: String(e),
    };
  }
}
