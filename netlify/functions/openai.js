<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Certiverso AI Test (Netlify)</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 10px; }
    input[type="text"] { width: 820px; max-width: 100%; padding: 10px; }
    button { padding: 10px 14px; cursor:pointer; }
    pre { white-space: pre-wrap; border: 1px solid #ccc; padding: 12px; margin-top: 12px; border-radius: 6px; }
    small { color:#444; }
  </style>
</head>
<body>
  <h2>Imagen → JSON (Netlify Function)</h2>

  <div class="row">
    <b>Archivo:</b>
    <input type="file" id="file" accept="image/*" />
    <button id="runFile" disabled>Probar (archivo)</button>
  </div>

  <div class="row">
    <b>URL:</b>
    <input id="imgUrl" type="text" value="https://certiverso.online/images/1749910987186-345245658.png" />
    <button id="runUrl">Probar (URL)</button>
  </div>

  <small>
    Si por URL falla, probá por archivo (subida local). Con este JS, la function descarga la imagen y la manda en base64.
  </small>

  <pre id="out">Listo.</pre>

  <script>
    const out = document.getElementById("out");
    const fileInput = document.getElementById("file");
    const runFile = document.getElementById("runFile");
    const runUrl = document.getElementById("runUrl");
    const urlInput = document.getElementById("imgUrl");

    function fileToDataURL(file){
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); // data:image/...;base64,....
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function pretty(text){
      try { return JSON.stringify(JSON.parse(text), null, 2); }
      catch { return text; }
    }

    async function call(payload){
      out.textContent = "Enviando...";
      const r = await fetch("/.netlify/functions/openai", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const t = await r.text();
      out.textContent = pretty(t);
    }

    fileInput.addEventListener("change", () => {
      runFile.disabled = !(fileInput.files && fileInput.files.length > 0);
    });

    runFile.addEventListener("click", async () => {
      const f = fileInput.files?.[0];
      if (!f) { out.textContent = "Selecciona un archivo primero."; return; }
      const dataUrl = await fileToDataURL(f);
      await call({ image_base64: dataUrl, image_mime: f.type || "image/png" });
    });

    runUrl.addEventListener("click", async () => {
      const image_url = urlInput.value.trim();
      if (!image_url) { out.textContent = "Pega una URL primero."; return; }
      await call({ image_url });
    });
  </script>
</body>
</html>
