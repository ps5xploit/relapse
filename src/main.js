const logger = {
  verbose: /[?&]verbose=1/.test(location.search),

  init() {
    this.console = document.getElementById('console');
  },
  info(msg) {
    this.log('[+]', `${msg}`);
  },
  error(msg) {
    this.log('[-]', `${msg}`);
  },
  debug(msg) {
    if (this.verbose) this.log('[*]', `${msg}`);
  },
  log(prefix, msg) {
    if (typeof hostLog === 'function') {
      hostLog(prefix, msg);
      return;
    }

    if (!this.console) return;

    this.console.append(`${prefix} ${String(msg).replace(/\n/g, `\n${prefix} `)}\n`);
    this.console.scrollTop = this.console.scrollHeight;
  },
};

window.onerror = function (message, source, line, column, error) {
  let msg = message;

  if (error && error.stack) {
    msg += `\n${error.stack}`;
  } else {
    msg += `\n@${source}:${line}:${column}`;
  }

  logger.error(msg);
  return true;
};

window.onunhandledrejection = function (event) {
  const err = event.reason;

  let msg = err && err.message ? err.message : String(err);

  if (err && err.stack) {
    msg += `\n${err.stack}`;
  }

  logger.error(msg);
};

function load_script(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

// XHR en vez de fetch: en el WebKit de PS5 fetch() no pasa por la appcache,
// asi que offline los payloads no cargarian.
function load_file(src) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 20000;
    xhr.onload = () => {
      if (xhr.status !== 200 && xhr.status !== 0) {
        reject(new Error(`HTTP ${xhr.status}: ${src}`));
        return;
      }
      resolve(new Uint8Array(xhr.response));
    };
    xhr.onerror = () => reject(new Error(`Failed to load: ${src}`));
    xhr.ontimeout = () => reject(new Error(`Timeout: ${src}`));
    xhr.send();
  });
}

async function main() {
  await load_script('src/misc.js');

  version.init();

  switch (version.console) {
    case 4:
      await load_script('src/ps4/impl.js');
      break;
    case 5:
      await load_script('src/ps5/impl.js');
      break;
    default:
      throw new Error(`Unsupported console ${version.console}`);
  }

  await load_script('src/userland.js');
  await userland_main();

  await load_script('src/kernel.js');
  await load_script('src/autoload.js');

  await kernel_main();

  try {
    await autoload_pldmgr();
  } catch (error) {
    logger.error(error && error.message ? error.message : String(error));
  }
}

logger.init();
main();
