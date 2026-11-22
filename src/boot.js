// Boot de la pagina: mantiene el log y el diseno de my-relapse, espera a que
// el appcache termine y arranca el motor de wobkot (src/main.js).

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
    logBuffer[logBuffer.length - 1] = formatted;
    renderBuffer();
    return;
  }

  logBuffer.push(formatted);

  if (logBuffer.length > LOG_MAX_LINES) {
    logBuffer = [formatted];
  }

  renderBuffer();
}

window.writeLog = writeLog;

// Puente para el logger de wobkot (misc.js / main.js / thread.js).
window.hostLog = function (prefix, msg) {
  const text = String(msg).replace(/\n/g, " | ");
  writeLog(prefix + " " + text, prefix.indexOf("[-]") === 0 ? "error" : "log");
};

// Cartel en la propia pagina: el alert() no se muestra en el navegador de PS5.
function showBanner(message) {
  try {
    let el = document.getElementById("host-banner");

    if (!el) {
      el = document.createElement("div");
      el.id = "host-banner";
      el.style.cssText =
        "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);" +
        "z-index:9999;background:#0d0d10;border:2px solid #e6c35c;" +
        "color:#f2f2f5;font:700 26px/1.45 'Lucida Console','Courier New',monospace;" +
        "padding:26px 40px;border-radius:14px;text-align:center;max-width:80vw;" +
        "white-space:pre-line;box-shadow:0 0 60px rgba(0,0,0,.85);";
      document.body.appendChild(el);
    }

    el.textContent = message;
  } catch (error) {}
}

// ============================================================
// Carga de scripts (los del motor de wobkot)
// ============================================================
function loadScript(src) {
  return new Promise(function (resolve, reject) {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = function () {
      reject(new Error("Failed to load " + src));
    };
    document.head.appendChild(script);
  });
}

// ============================================================
// Cache offline: espera al appcache antes de arrancar el exploit
// ============================================================
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

async function boot() {
  if (window.applicationCache && document.documentElement.hasAttribute("manifest")) {
    writeLog("Waiting for cache...", "info");
    const reason = await waitForAppCache(15000);

    // Solo cuando se ha escrito cache nueva sale el aviso "Successfully"
    // (1 s despues del evento); dejamos que aparezca antes del exploit.
    if (reason === "cached" || reason === "updateready") {
      await new Promise(function (resolve) {
        setTimeout(resolve, 1500);
      });
    }
    writeLog(
      reason === "error" ? "Cache error" : "Cache ready",
      reason === "error" ? "error" : "success",
    );
  }


  try {
    await loadScript("./src/main.js");
  } catch (error) {
    writeLog(String((error && error.message) || error), "error");
  }
}

boot();
