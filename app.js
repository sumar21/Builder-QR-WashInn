const ENDPOINT_URL =
  "https://default20435c5a4f504349a09a856bdf1f70.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/d4de5a7b7da44c088034b6eaecc89ed7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lJpna6aHRgy3ryn0umLA472LQCQGzR_9WsnGjvfQLxU";
// Si el flujo requiere OAuth (401 DirectApiAuthorizationRequired), pega aquí un Bearer token válido.
const ENDPOINT_BEARER_TOKEN = "";
const POSTER_FONT = "Geist";

const fieldSchema = [
  { name: "codigo", type: "string" },
  { name: "edificio", type: "string" },
  { name: "direccion", type: "string" },
  { name: "latitud1", type: "number" },
  { name: "longitud1", type: "number" },
  { name: "latitud_ED", type: "string" },
  { name: "longitud_ED", type: "string" },
  { name: "latitud2", type: "number" },
  { name: "longitud2", type: "number" },
  { name: "latitud2_ED", type: "string" },
  { name: "longitud2_ED", type: "string" },
  { name: "encargado", type: "string" },
  { name: "telefono", type: "integer" },
  { name: "horario", type: "string" },
  { name: "frecuencia", type: "integer" },
  { name: "grupo_ventilacion", type: "string" },
  { name: "mail", type: "string" },
  { name: "observaciones", type: "string" }
];
const requiredFieldNames = new Set(["codigo", "edificio", "latitud1", "longitud1", "direccion"]);
const endpointStringEdFields = new Set([
  "latitud_ED",
  "longitud_ED",
  "latitud2_ED",
  "longitud2_ED"
]);

const form = document.getElementById("buildingForm");
const sendButton = document.getElementById("btnSend");
const downloadButton = document.getElementById("btnDownload");
const statusMessage = document.getElementById("statusMessage");
const posterCanvas = document.getElementById("posterCanvas");
const ctx = posterCanvas.getContext("2d");
const coordinateInputs = Array.from(form.querySelectorAll('input[data-coordinate="true"]'));
const formInputs = Array.from(form.querySelectorAll("input, textarea"));
const flowLabel = document.getElementById("flowLabel");
const completionLabel = document.getElementById("completionLabel");
const progressBar = document.getElementById("progressBar");
const flowHelper = document.getElementById("flowHelper");
const downloadGate = document.getElementById("downloadGate");
const downloadGateTitle = document.getElementById("downloadGateTitle");
const downloadGateMessage = document.getElementById("downloadGateMessage");

const imageAssets = {};
let lastPayload = buildEmptyPayload();
let showValidationErrors = false;
let endpointState = {
  requestStatus: "idle",
  confirmedSignature: ""
};
const fieldLabelByName = buildFieldLabelMap();

function buildEmptyPayload() {
  const output = {};
  for (const field of fieldSchema) {
    output[field.name] = field.type === "integer" || field.type === "number" ? null : "";
  }
  return output;
}

function buildFieldLabelMap() {
  const map = new Map();
  for (const field of form.querySelectorAll(".field")) {
    const input = field.querySelector("input, textarea");
    const label = field.querySelector("span");
    if (input?.name && label?.textContent) {
      map.set(input.name, label.textContent.trim());
    }
  }
  return map;
}

function markSchemaFieldsAsRequired() {
  for (const input of formInputs) {
    if (!input.name) continue;
    input.required = requiredFieldNames.has(input.name);
  }
}

function serializePayload(payload) {
  const ordered = {};
  for (const field of fieldSchema) {
    ordered[field.name] = payload[field.name];
  }
  return JSON.stringify(ordered);
}

function evaluatePayload(payload) {
  const requiredFields = fieldSchema.filter((field) => requiredFieldNames.has(field.name));
  const total = requiredFields.length;
  const missingFields = [];
  const invalidFields = [];
  let validCount = 0;

  for (const field of requiredFields) {
    const value = payload[field.name];
    let isValid = false;

    if (field.type === "integer") {
      isValid = Number.isInteger(value);
      if (!isValid) {
        missingFields.push({ name: field.name });
      }
    } else if (field.type === "number") {
      isValid = typeof value === "number" && Number.isFinite(value);
      if (!isValid) {
        missingFields.push({ name: field.name });
      }
    } else {
      const text = String(value ?? "").trim();
      isValid = text.length > 0;

      if (!isValid) {
        missingFields.push({ name: field.name });
      }
    }

    if (isValid) {
      validCount += 1;
    }
  }

  const emailText = String(payload.mail ?? "").trim();
  if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) {
    invalidFields.push({ name: "mail", reason: "email" });
  }

  const percentage = Math.round((validCount / total) * 100);
  return {
    total,
    validCount,
    percentage,
    isComplete: validCount === total,
    missingFields,
    invalidFields
  };
}

function getFieldLabel(name) {
  return fieldLabelByName.get(name) || name;
}

function getValidationGuidance(validation) {
  if (validation.isComplete) {
    return "Campos obligatorios completos. Guardá los datos para habilitar la descarga.";
  }

  const missingLabels = validation.missingFields.slice(0, 4).map((field) => getFieldLabel(field.name));
  const missingOverflow = validation.missingFields.length - missingLabels.length;
  let missingCopy = "";

  if (missingLabels.length) {
    missingCopy = `Faltan: ${missingLabels.join(", ")}`;
    if (missingOverflow > 0) {
      missingCopy += ` y ${missingOverflow} más`;
    }
    missingCopy += ".";
  }

  const hasInvalidEmail = validation.invalidFields.some((field) => field.reason === "email");
  const emailCopy = hasInvalidEmail ? " Revisá el formato del mail." : "";

  return `Completá los campos obligatorios (${validation.validCount}/${validation.total}). ${missingCopy}${emailCopy}`.trim();
}

function isPayloadRegistered(payload) {
  if (!endpointState.confirmedSignature) return false;
  return endpointState.confirmedSignature === serializePayload(payload);
}

function setDownloadGate(state, title, message) {
  downloadGate.dataset.state = state;
  downloadGateTitle.textContent = title;
  downloadGateMessage.textContent = message;
}

function updateFieldErrorState(validation) {
  const invalidNames = new Set([
    ...validation.missingFields.map((field) => field.name),
    ...validation.invalidFields.map((field) => field.name)
  ]);

  for (const input of formInputs) {
    if (!input.name || !fieldLabelByName.has(input.name)) continue;
    const shouldMark = showValidationErrors && invalidNames.has(input.name);
    input.setAttribute("aria-invalid", shouldMark ? "true" : "false");
  }
}

function updateActionButtons(validation, isRegistered) {
  const isSending = endpointState.requestStatus === "sending";
  sendButton.disabled = isSending || !validation.isComplete;

  if (isSending) {
    sendButton.textContent = "Guardando datos...";
  } else if (!validation.isComplete) {
    sendButton.textContent = `Completá obligatorios (${validation.validCount}/${validation.total})`;
  } else if (isRegistered) {
    sendButton.textContent = "Guardar cambios";
  } else if (endpointState.requestStatus === "error") {
    sendButton.textContent = "Reintentar guardado";
  } else if (endpointState.requestStatus === "success") {
    sendButton.textContent = "Guardar cambios";
  } else {
    sendButton.textContent = "Guardar datos";
  }

  const canDownload = validation.isComplete && isRegistered;
  downloadButton.disabled = !canDownload;
  downloadButton.setAttribute("aria-disabled", String(!canDownload));

  if (canDownload) {
    downloadButton.textContent = "Descargar JPG 1080x1350";
  } else if (!validation.isComplete) {
    downloadButton.textContent = "Completá obligatorios para descargar";
  } else {
    downloadButton.textContent = "Guardá los datos para descargar";
  }
}

function updateFlowState(payload = lastPayload) {
  const validation = evaluatePayload(payload);
  const isRegistered = isPayloadRegistered(payload);
  const canDownload = validation.isComplete && isRegistered;

  completionLabel.textContent = `${validation.percentage}% completo (${validation.validCount}/${validation.total})`;
  progressBar.style.width = `${validation.percentage}%`;
  progressBar.classList.toggle("is-complete", validation.isComplete);
  updateFieldErrorState(validation);
  updateActionButtons(validation, isRegistered);

  if (!validation.isComplete) {
    flowLabel.textContent = "Paso 1 de 3 · Completá los obligatorios";
    flowHelper.textContent = getValidationGuidance(validation);
    setDownloadGate("blocked", "Descarga bloqueada", "Completá los campos obligatorios para continuar.");
    return { validation, isRegistered, canDownload };
  }

  if (canDownload) {
    flowLabel.textContent = "Paso 3 de 3 · Descarga habilitada";
    flowHelper.textContent = "Datos guardados. Ya podés descargar la imagen.";
    setDownloadGate("ready", "Descarga habilitada", "Tus datos se guardaron correctamente.");
    return { validation, isRegistered, canDownload };
  }

  if (endpointState.requestStatus === "sending") {
    flowLabel.textContent = "Paso 2 de 3 · Guardando datos";
    flowHelper.textContent = "Estamos guardando tus datos para habilitar la descarga.";
    setDownloadGate("blocked", "Guardando datos", "Esperá unos segundos para continuar.");
    return { validation, isRegistered, canDownload };
  }

  flowLabel.textContent = "Paso 2 de 3 · Falta guardar los datos";
  if (endpointState.requestStatus === "error") {
    flowHelper.textContent = "No pudimos guardar los datos. Reintentá.";
    setDownloadGate("blocked", "Descarga bloqueada", "Sin guardar los datos no se habilita la descarga.");
  } else if (endpointState.requestStatus === "success") {
    flowHelper.textContent = "Detectamos cambios sin guardar. Guardalos para habilitar la descarga.";
    setDownloadGate("blocked", "Descarga bloqueada", "Primero guardá los cambios.");
  } else {
    flowHelper.textContent = "Campos obligatorios completos. Guardá los datos para desbloquear la descarga.";
    setDownloadGate("blocked", "Descarga bloqueada", "Primero guardá los datos.");
  }

  return { validation, isRegistered, canDownload };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar el recurso ${src}`));
    img.src = src;
  });
}

function setStatus(text = "", tone = "info") {
  statusMessage.textContent = text;
  statusMessage.className = "status-message";
  if (text) {
    statusMessage.classList.add(tone);
  }
}

function parseInteger(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNumber(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function floorToThreeDecimals(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value * 1000) / 1000;
}

function formatEdStringValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const floored = floorToThreeDecimals(value);
  return floored.toFixed(3).replace(".", ",");
}

function buildEndpointPayload(payload) {
  const output = {};

  for (const field of fieldSchema) {
    const value = payload[field.name];
    output[field.name] = endpointStringEdFields.has(field.name) ? formatEdStringValue(value) : value;
  }

  return output;
}

function normalizeCoordinateDraft(value) {
  return value;
}

function isCoordinateDraftValid(value) {
  return /^-?\d*(?:[.,]\d*)?$/.test(value);
}

function handleCoordinateKeydown(event) {
  if (event.key === "e" || event.key === "E" || event.key === "+") {
    event.preventDefault();
  }
}

function handleCoordinateInput(event) {
  const input = event.currentTarget;
  const normalized = normalizeCoordinateDraft(input.value);

  if (isCoordinateDraftValid(normalized)) {
    input.dataset.lastValid = normalized;
  } else {
    input.value = input.dataset.lastValid ?? "";
  }
}

function setupCoordinateInputGuards() {
  for (const input of coordinateInputs) {
    const normalized = normalizeCoordinateDraft(input.value);
    input.dataset.lastValid = isCoordinateDraftValid(normalized) ? normalized : "";
    input.addEventListener("keydown", handleCoordinateKeydown);
    input.addEventListener("input", handleCoordinateInput);
  }
}

function collectPayload() {
  const formData = new FormData(form);
  const payload = {};

  for (const field of fieldSchema) {
    const rawValue = String(formData.get(field.name) ?? "").trim();
    if (field.type === "integer") {
      payload[field.name] = parseInteger(rawValue);
    } else if (field.type === "number") {
      payload[field.name] = parseNumber(rawValue);
    } else {
      payload[field.name] = rawValue;
    }
  }

  payload.latitud_ED = floorToThreeDecimals(payload.latitud1);
  payload.longitud_ED = floorToThreeDecimals(payload.longitud1);
  payload.latitud2_ED = floorToThreeDecimals(payload.latitud2);
  payload.longitud2_ED = floorToThreeDecimals(payload.longitud2);

  return payload;
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function wrapTextLines(text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);

  if (!words.length) return [""];

  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const testLine = `${currentLine} ${words[i]}`;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }

  lines.push(currentLine);
  return lines;
}

function getBuildingDisplayName(payload) {
  const building = String(payload.edificio || "").trim();
  const address = String(payload.direccion || "").trim();

  if (building && address) return `${building} - ${address}`;
  if (building) return building;
  if (address) return address;
  return "AGREGA NOMBRE Y DIRECCION DEL EDIFICIO";
}

function getPosterTitle(payload) {
  const building = String(payload.edificio || "").trim();
  return (building || "AGREGA NOMBRE DEL EDIFICIO").toUpperCase();
}

function toDownloadSlug(text) {
  return String(text || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function generateQrCanvas(codigo) {
  const qrData = String(codigo || "").trim() || "SIN-CODIGO";
  const qr = qrcode(0, "Q");
  qr.addData(qrData);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const size = 400;
  const cellSize = Math.floor(size / moduleCount);
  const margin = Math.floor((size - moduleCount * cellSize) / 2);

  const qrCanvas = document.createElement("canvas");
  qrCanvas.width = size;
  qrCanvas.height = size;

  const qrContext = qrCanvas.getContext("2d");
  qrContext.fillStyle = "#ffffff";
  qrContext.fillRect(0, 0, size, size);
  qrContext.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qr.isDark(row, col)) {
        qrContext.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
      }
    }
  }

  return qrCanvas;
}

function drawFooterWarningIcon(x, y, size) {
  const sides = 8;
  const radius = size / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();

  for (let i = 0; i < sides; i += 1) {
    const angle = ((Math.PI * 2) / sides) * i - Math.PI / 8;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = `600 ${Math.floor(size * 0.6)}px ${POSTER_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("!", 0, 2);
  ctx.restore();
}

function drawPoster(payload) {
  const width = posterCanvas.width;
  const height = posterCanvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#3f98ea";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(imageAssets.topRight, width - 250, -20, 320, 320);
  ctx.drawImage(imageAssets.bottomLeft, -230, 915, 430, 430);
  ctx.drawImage(imageAssets.bottomRight, 840, 1020, 230, 230);

  const logoTargetWidth = 380;
  const logoRatio = imageAssets.logo.height / imageAssets.logo.width;
  const logoHeight = logoTargetWidth * logoRatio;
  ctx.drawImage(imageAssets.logo, (width - logoTargetWidth) / 2, 90, logoTargetWidth, logoHeight);

  const title = getPosterTitle(payload);
  const titleFont = `700 42px ${POSTER_FONT}`;
  ctx.font = titleFont;
  const tempPanelWidth = 700;
  const titleLines = wrapTextLines(title, tempPanelWidth - 60, titleFont).slice(0, 2);
  const numLines = titleLines.length;

  const panelHeight = 740 + (numLines === 2 ? 54 : 0);
  const panel = { x: 190, y: 345, width: tempPanelWidth, height: panelHeight };

  drawRoundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 16);
  ctx.fillStyle = "rgba(180, 217, 255, 0.23)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";

  const lineHeight = 54;
  const titleTop = panel.y + 45;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, width / 2, titleTop + index * lineHeight);
  });

  const qrCanvas = generateQrCanvas(payload.codigo);
  const qrBoxSize = 420;
  const qrX = (width - qrBoxSize) / 2;
  const qrY = titleTop + (numLines * lineHeight) + 31;

  drawRoundedRect(ctx, qrX, qrY, qrBoxSize, qrBoxSize, 22);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const qrImageSize = qrBoxSize - 50;
  ctx.drawImage(qrCanvas, qrX + 25, qrY + 25, qrImageSize, qrImageSize);

  ctx.fillStyle = "#ffffff";
  ctx.font = `500 40px ${POSTER_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const descY = qrY + qrBoxSize + 48;
  ctx.fillText("Escanea el QR para", width / 2, descY);
  ctx.fillText("comenzar el mantenimiento.", width / 2, descY + 50);

  const warningText = "Uso exclusivo para personal de Wash Inn";
  ctx.font = `500 32px ${POSTER_FONT}`;
  const textW = ctx.measureText(warningText).width;
  const iconSize = 40;
  const gap = 16;
  const totalBarWidth = iconSize + gap + textW;
  const startX = (width - totalBarWidth) / 2;
  const iconX = startX + iconSize / 2;
  const warningY = 1220;

  drawFooterWarningIcon(iconX, warningY, iconSize);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(warningText, startX + iconSize + gap, warningY + 2);
}

async function sendPayload(payload) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (ENDPOINT_BEARER_TOKEN.trim()) {
    headers.Authorization = `Bearer ${ENDPOINT_BEARER_TOKEN.trim()}`;
  }

  const response = await fetch(ENDPOINT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(buildEndpointPayload(payload))
  });

  if (!response.ok) {
    const bodyText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }

    const apiErrorCode = parsed?.error?.code;
    const apiErrorMessage = parsed?.error?.message;
    const details = apiErrorMessage || bodyText || "Error desconocido";

    throw new Error(`${response.status}|${apiErrorCode || "HTTP_ERROR"}|${details}`);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const payload = collectPayload();
  lastPayload = payload;
  drawPoster(payload);
  showValidationErrors = true;
  const { validation } = updateFlowState(payload);

  if (!validation.isComplete) {
    setStatus("Completá los campos obligatorios para guardar los datos.", "error");
    return;
  }

  endpointState.requestStatus = "sending";
  updateFlowState(lastPayload);
  setStatus("Guardando datos...", "info");

  try {
    await sendPayload(payload);
    endpointState.requestStatus = "success";
    endpointState.confirmedSignature = serializePayload(payload);
    const { canDownload } = updateFlowState(lastPayload);

    if (canDownload) {
      setStatus("Datos guardados. Descarga habilitada.", "success");
    } else {
      setStatus("Datos guardados, pero hay cambios sin guardar. Guardalos para descargar.", "info");
    }
  } catch (error) {
    endpointState.requestStatus = "error";
    updateFlowState(lastPayload);

    const message = String(error?.message || "");
    const [, apiErrorCode] = message.split("|");

    if (apiErrorCode === "DirectApiAuthorizationRequired") {
      setStatus(
        "No pudimos guardar por una configuración de seguridad. Avisá al equipo técnico.",
        "error"
      );
    } else if (apiErrorCode === "TriggerInputSchemaMismatch") {
      setStatus(
        "El flujo rechazó el formato de datos. Revisá el schema configurado en Power Automate.",
        "error"
      );
    } else if (apiErrorCode && apiErrorCode !== "HTTP_ERROR") {
      setStatus("No pudimos guardar los datos. Reintentá en unos segundos.", "error");
    } else {
      setStatus(
        "No pudimos guardar los datos. La descarga seguirá bloqueada hasta que se guarden.",
        "error"
      );
    }
    console.error(error);
  }
}

function handleDownload() {
  const payload = collectPayload();
  lastPayload = payload;
  drawPoster(payload);
  const { validation, canDownload } = updateFlowState(payload);

  if (!validation.isComplete) {
    showValidationErrors = true;
    updateFlowState(payload);
    setStatus("Descarga bloqueada: completá los campos obligatorios.", "error");
    return;
  }

  if (!canDownload) {
    setStatus("Descarga bloqueada: primero guardá los datos.", "error");
    return;
  }

  const codeSuffix = toDownloadSlug(getBuildingDisplayName(payload)) || "qr";
  const link = document.createElement("a");
  link.download = `washinn-${codeSuffix}.jpg`;
  link.href = posterCanvas.toDataURL("image/jpeg", 0.94);
  link.click();
  setStatus("Descarga iniciada.", "success");
}

async function init() {
  setStatus("Cargando recursos visuales...", "info");
  markSchemaFieldsAsRequired();
  setupCoordinateInputGuards();

  imageAssets.topRight = await loadImage(encodeURI("Circulo Blur arriba derecha.png"));
  imageAssets.bottomLeft = await loadImage(encodeURI("Circulo izquierda abajo.png"));
  imageAssets.bottomRight = await loadImage(encodeURI("Mini circulo blur abajo derecha.png"));
  imageAssets.logo = await loadImage(encodeURI("Logo WashInn.svg"));

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  endpointState.requestStatus = "idle";
  setStatus("Completá los campos obligatorios, guardá los datos y luego descargá la imagen.", "info");
  drawPoster(lastPayload);
  updateFlowState(lastPayload);
}

form.addEventListener("input", () => {
  const wasDownloadEnabled = isPayloadRegistered(lastPayload) && evaluatePayload(lastPayload).isComplete;
  const payload = collectPayload();
  lastPayload = payload;
  drawPoster(payload);
  const { canDownload } = updateFlowState(payload);

  if (wasDownloadEnabled && !canDownload) {
    setStatus("Hay cambios sin guardar. Volvé a guardar los datos para desbloquear la descarga.", "info");
  }
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    for (const input of coordinateInputs) {
      const normalized = normalizeCoordinateDraft(input.value);
      input.dataset.lastValid = isCoordinateDraftValid(normalized) ? normalized : "";
    }
    lastPayload = buildEmptyPayload();
    showValidationErrors = false;
    endpointState = {
      requestStatus: "idle",
      confirmedSignature: ""
    };
    drawPoster(lastPayload);
    updateFlowState(lastPayload);
    setStatus("Formulario reiniciado. Completalo y guardá los datos para habilitar la descarga.", "info");
  }, 0);
});

form.addEventListener("submit", handleSubmit);
downloadButton.addEventListener("click", handleDownload);

init().catch((error) => {
  setStatus("No se pudieron cargar los recursos gráficos.", "error");
  console.error(error);
});
