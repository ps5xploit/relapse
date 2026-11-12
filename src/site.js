import { establishPrimitive } from "./webkit.js";
import { installWindowP } from "./utils/mem.js";

const output = document.getElementById("console");

// ============================================================
// LOG BUFFER: solo se muestran 4 lineas a la vez.
// Cuando llega la 5a, se vacia el bloque y empieza uno nuevo.
// ============================================================
const LOG_MAX_LINES = 4;
let logBuffer = [];
let astroShown = false;

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

// El Astro solo se muestra cuando el stage WebKit ya ha terminado, para no
// meter decodificacion de imagen ni repintados durante el heap grooming.
let astroTimer = null;

function showAstro() {
  if (astroShown) return;
  astroShown = true;
  const el = document.getElementById("astro");
  if (!el) return;

  // Ajuste en vivo desde la URL:
  //   ?aw=280   ancho/alto del astro en px (por defecto 320)
  //   ?ab=40    separacion del borde inferior en px (por defecto 0)
  const query = new URLSearchParams(location.search);
  const reqSize = parseInt(query.get("aw"), 10);
  const reqBottom = parseInt(query.get("ab"), 10);
  const W = reqSize > 0 ? reqSize : 320;

  if (reqSize > 0) {
    el.style.width = W + "px";
    el.style.height = W + "px";
    el.style.backgroundSize = W * 19 + "px " + W + "px";
  }
  if (reqBottom >= 0) el.style.bottom = reqBottom + "px";

  el.style.display = "block";
  let i = 0;
  const FRAMES = 13;
  astroTimer = setInterval(function () {
    i = (i + 1) % FRAMES;
    el.style.backgroundPosition = -i * W + "px 0px";
  }, 80);
}

// Se va hacia abajo, como si se agachara, y desaparece antes del exploit.
function hideAstro() {
  return new Promise(function (resolve) {
    const el = document.getElementById("astro");
    if (!el) return resolve();
    if (astroTimer !== null) {
      clearInterval(astroTimer);
      astroTimer = null;
    }
    const startBottom = parseFloat(el.style.bottom) || 0;
    const dist = (el.offsetHeight || 320) + 20;
    const started = Date.now();
    const dur = 320;
    (function step() {
      const t = Math.min(1, (Date.now() - started) / dur);
      const eased = t * t;
      el.style.bottom = startBottom - dist * eased + "px";
      if (t < 1) setTimeout(step, 16);
      else {
        el.style.display = "none";
        el.style.bottom = startBottom + "px";
        resolve();
      }
    })();
  });
}

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


// Espera a que el appcache termine de guardar la pagina (hasta timeoutMs).
function waitForAppCache(timeoutMs) {
  return new Promise(function (resolve) {
    const ac = window.applicationCache;
    if (!ac) return resolve();
    if (ac.status === ac.IDLE || ac.status === ac.UPDATEREADY) return resolve();

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      resolve();
    }
    ac.addEventListener("cached", finish);
    ac.addEventListener("noupdate", finish);
    ac.addEventListener("updateready", finish);
    ac.addEventListener("error", finish);
    setTimeout(finish, timeoutMs);
  });
}

async function run() {
  const rejection = window.firmware.rejection();
  if (rejection)
    throw new Error(rejection);

  const appCache = window.applicationCache;
  const cachePending =
    appCache &&
    document.documentElement.hasAttribute("manifest") &&
    appCache.status !== appCache.IDLE &&
    appCache.status !== appCache.UPDATEREADY;

  if (cachePending) writeLog("Waiting for cache...", "info");

  // Intro: el Astro saluda mientras se guarda la cache y se agacha antes de
  // que arranque el exploit.
  if (document.getElementById("astro")) {
    showAstro();
    await new Promise(function (resolve) {
      setTimeout(resolve, 1040);
    });
    await hideAstro();
  }

  if (cachePending) {
    await waitForAppCache(6000);
    writeLog("Cache ready", "success");
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
