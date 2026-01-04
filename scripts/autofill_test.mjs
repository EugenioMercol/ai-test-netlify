import fs from "fs/promises";
import path from "path";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error("Missing OPENAI_API_KEY secret");

const IMAGE_URL = (process.env.IMAGE_URL || "").trim();
const IMAGE_PATH = (process.env.IMAGE_PATH || "").trim();
const MODEL = (process.env.MODEL || "gpt-4o-2024-08-06").trim();

function guessMime(p) {
  const ext = (p.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function loadImageAsDataUrl() {
  let buf, mime;

  if (IMAGE_PATH) {
    const abs = path.resolve(process.cwd(), IMAGE_PATH);
    buf = await fs.readFile(abs);
    mime = guessMime(IMAGE_PATH);
  } else if (IMAGE_URL) {
    const res = await fetch(IMAGE_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`Failed downloading IMAGE_URL: ${res.status} ${res.statusText}`);
    const ct = res.headers.get("content-type") || "";
    mime = ct.includes("png") ? "image/png" : ct.includes("webp") ? "image/webp" : "image/jpeg";
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("Provide IMAGE_PATH or IMAGE_URL");
  }

  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// Prompt final (duro)
const instructions =
  "Devuelve SOLO JSON válido que cumpla exactamente el schema (strict). Idioma: español. No inventes ni supongas. " +
  "Si un texto NO se puede determinar con evidencia visual clara en la imagen, devuelve '' (string vacío). " +
  "Prohibido escribir frases tipo “imagen de ejemplo”, “no hay información”, “no representa un producto real”. " +
  "Booleanos: true SOLO si hay evidencia visual clara e inequívoca; si hay duda, false. " +
  "Límites de caracteres (no truncar; reformular para cumplir): " +
  "productDescription<=30, productName<=20, productBrand<=20, productUseAndApplication<=100, productDescriptionExtended<=600, productWarning<=600. " +
  "Sin saltos de línea en ningún string. " +
  "Advertencias (Paso 5): solo escribir advertencias si primero pudiste identificar el tipo de producto con evidencia clara; si no, ''.";

// Schema plano por IDs (recomendado para mapear)
const schema = {
  name: "certiverso_autofill_fields_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "fields"],
    properties: {
      schema_version: { type: "string", enum: ["1.0"] },
      fields: {
        type: "object",
        additionalProperties: false,
        required: [
          "step2.productInformation.group1.productDescription",
          "step2.productInformation.group1.productName",
          "step2.productInformation.group1.productBrand",
          "step2.productInformation.group1.productUseAndApplication",
          "step2.productInformation.detailedProductDescription.productDescriptionExtended",
          "step2.productInformation.generalInformation.isElectric",
          "step2.productInformation.productUses.foodContact",
          "step2.productInformation.productMaterials.containsPaper",
          "step2.productInformation.productMaterials.containsGlass",
          "step2.productInformation.productMaterials.containsMetal",
          "step2.productInformation.productMaterials.containsTextiles",
          "step2.productInformation.productMaterials.containsBiodegradableMaterial",
          "step5.productInfo.productWarning.productWarning"
        ],
        properties: {
          "step2.productInformation.group1.productDescription": { type: "string" },
          "step2.productInformation.group1.productName": { type: "string" },
          "step2.productInformation.group1.productBrand": { type: "string" },
          "step2.productInformation.group1.productUseAndApplication": { type: "string" },
          "step2.productInformation.detailedProductDescription.productDescriptionExtended": { type: "string" },
          "step2.productInformation.generalInformation.isElectric": { type: "boolean" },
          "step2.productInformation.productUses.foodContact": { type: "boolean" },
          "step2.productInformation.productMaterials.containsPaper": { type: "boolean" },
          "step2.productInformation.productMaterials.containsGlass": { type: "boolean" },
          "step2.productInformation.productMaterials.containsMetal": { type: "boolean" },
          "step2.productInformation.productMaterials.containsTextiles": { type: "boolean" },
          "step2.productInformation.productMaterials.containsBiodegradableMaterial": { type: "boolean" },
          "step5.productInfo.productWarning.productWarning": { type: "string" }
        }
      }
    }
  }
};

const dataUrl = await loadImageAsDataUrl();

const body = {
  model: MODEL,
  temperature: 0,
  instructions,
  text: { format: { type: "json_schema", ...schema } },
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Analiza la imagen y completa los fields con evidencia visual." },
        { type: "input_image", image_url: dataUrl }
      ]
    }
  ]
};

const resp = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

const json = await resp.json();
if (!resp.ok) {
  console.error("OpenAI error:", JSON.stringify(json, null, 2));
  process.exit(1);
}

// Extrae el texto JSON (structured output) desde output_text
const outText =
  json?.output?.[0]?.content?.find?.(c => c.type === "output_text")?.text
  ?? null;

if (!outText) {
  console.error("No output_text found. Full response:", JSON.stringify(json, null, 2));
  process.exit(1);
}

// Guarda resultado
await fs.mkdir("out", { recursive: true });
await fs.writeFile("out/result.json", outText, "utf8");

console.log("RESULT_JSON:", outText);
