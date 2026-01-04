// netlify/functions/openai.js
// Netlify Function: recibe una imagen en base64 (data URL o base64 pelado)
// y devuelve JSON estructurado (schema fijo) usando OpenAI Responses API.

export async function handler(event) {
  try {
    // CORS básico (por si pruebas desde otro dominio)
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
    if (!apiKey) {
      return { statusCode: 500, body: "Missing OPENAI_API_KEY env var" };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    const imageMime = (payload.image_mime || "image/png").trim();
    let imageBase64 = (payload.image_base64 || "").trim();

    if (!imageBase64) {
      return { statusCode: 400, body: "Missing image_base64" };
    }

    // Acepta:
    // 1) data URL: data:image/png;base64,AAA...
    // 2) base64 pelado: AAA...
    // Si es base64 pelado, lo convertimos a data URL
    if (!imageBase64.startsWith("data:")) {
      // Limpieza básica por si viene con prefijos raros
      imageBase64 = imageBase64.replace(/^base64,?/i, "").trim();
      imageBase64 = `data:${imageMime};base64,${imageBase64}`;
    }

    // ====== Schema completo Step2 + Step5 (con IDs tuyos) ======
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
                        "step2.productInformation.group1.productDescription. Máx 30 caracteres (contando espacios). Descripción corta del producto visible (ej: 'Botella tipo shaker'). Si no se puede deducir sin inventar, devuelve ''. Sin saltos de línea.",
                    },
                    productName: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productName. Máx 20 caracteres. Nombre del producto SOLO si se ve claramente en la imagen (marca impresa, etiqueta, packaging). Si no se ve, ''. Sin saltos de línea.",
                    },
                    productBrand: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productBrand. Máx 20 caracteres. Marca SOLO si se ve claramente en la imagen. Si no se ve, ''. Sin saltos de línea.",
                    },
                    productUseAndApplication: {
                      type: "string",
                      description:
                        "step2.productInformation.group1.productUseAndApplication. Máx 100 caracteres. Uso y aplicación breve, genérico y coherente con el producto visible. No inventes especificaciones. Si hay duda, ''. Sin saltos de línea.",
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
                        "step2.productInformation.detailedProductDescription.productDescriptionExtended. Máx 600 caracteres. Descripción detallada coherente con el producto visible. No inventes certificaciones, normas, modelos, valores técnicos ni materiales no visibles. Si no se puede deducir con seguridad, usa una descripción genérica del tipo de producto (sin datos específicos). Sin saltos de línea.",
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
                        "step2.productInformation.generalInformation.isElectric. true SOLO si hay evidencia visible de electricidad/baterías/partes electrónicas (cable, conector, puerto, batería, PCB, LEDs, cargador, iconos). Si no se ve claramente, false.",
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
                        "step2.productInformation.productUses.foodContact. true SOLO si se infiere claramente que está diseñado para contacto con alimentos/bebidas (botella, taza, vaso, utensilio, contenedor de comida, símbolos/etiquetas visibles). Si no es claro, false.",
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
                    containsPaper: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productMaterials.containsPaper. true SOLO si se ve claramente papel/cartón (caja, etiqueta de cartón, envoltorio de papel) como parte del producto o su empaque. Si hay duda, false.",
                    },
                    containsGlass: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productMaterials.containsGlass. true SOLO si se ve claramente vidrio. Si hay duda, false.",
                    },
                    containsMetal: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productMaterials.containsMetal. true SOLO si se ve claramente metal (cuerpo metálico, piezas metálicas visibles). Si hay duda, false.",
                    },
                    containsTextiles: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productMaterials.containsTextiles. true SOLO si se ven telas/tejidos/textiles como material del producto (no fondo). Si hay duda, false.",
                    },
                    containsBiodegradableMaterial: {
                      type: "boolean",
                      description:
                        "step2.productInformation.productMaterials.containsBiodegradableMaterial. true SOLO si hay evidencia visible (texto/etiqueta que lo indique) o si el material biodegradable es obvio y visible. Si no es claro, false.",
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
                        "step5.productInfo.productWarning.productWarning. Máx 600 caracteres. Peligros por mal uso, prohibiciones y cuidados. Debe ser genérico y coherente con el tipo de producto visible. Estructura recomendada (sin saltos de línea): (1) Riesgos típicos. (2) Prohibiciones con 'No...'. (3) Cuidados/uso seguro. NO inventes certificaciones, normas, números técnicos, temperaturas, voltajes, edades ni materiales no visibles.",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // ====== Instrucciones globales (hard rules) ======
    const instructions =
      "Devuelve SOLO JSON válido que cumpla exactamente el schema. " +
      "Idioma: español. " +
      "REGLAS: " +
      "(1) No inventes datos no visibles. " +
      "(2) Strings: si no se puede determinar con seguridad, devuelve ''. " +
      "(3) Booleanos: true SOLO si hay evidencia clara visible; si hay duda, false. " +
      "(4) LÍMITES estrictos: productDescription<=30, productName<=20, productBrand<=20, productUseAndApplication<=100, productDescriptionExtended<=600, productWarning<=600. Cuenta caracteres incluyendo espacios. " +
      "(5) Antes de responder, verifica internamente longitudes y reformula para NO exceder límites. " +
      "(6) Sin saltos de línea en ningún string. " +
      "(7) Sin markdown, sin explicaciones: solo el JSON.";

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

    // Intentar devolver SOLO el JSON final (output_text) si existe
    try {
      const parsed = JSON.parse(raw);
      const outText = parsed?.output_text;

      if (typeof outText === "string" && outText.trim()) {
        // output_text debería ser el JSON resultante como string
        // Intentamos parsearlo para devolverlo como JSON limpio
        try {
          const finalObj = JSON.parse(outText);
          return {
            statusCode: resp.status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(finalObj),
          };
        } catch {
          // Si no se puede parsear, devolvemos el string tal cual
          return {
            statusCode: resp.status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: outText,
          };
        }
      }
    } catch {
      // ignore
    }

    // Fallback: devolver la respuesta cruda para debug
    return {
      statusCode: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: raw,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
      body: String(e),
    };
  }
}

