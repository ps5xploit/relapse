// Carga del payload manager (pldmgr.elf) en el elfldr que ya esta escuchando
// en 127.0.0.1:9021, igual que hacia my-relapse tras el exploit.

// Comprueba si el elfldr ya esta escuchando en 127.0.0.1:9021 (senal de que
// el exploit ya se lanzo en esta sesion del navegador).
function probe_elfldr() {
  if (!fn.connect) {
    fn.connect = new NativeFunction(0x62, 'number'); // connect(2)
  }

  const [sa_ab, sa] = mem.alloc(0x10, true);
  mem.bset(sa, 0x10, 0);
  const view = arw.view(sa);
  view.setUint8(0, 0x10); // sin_len
  view.setUint8(1, 2); // AF_INET
  view.setUint16(2, 9021, false); // sin_port, network order
  view.setUint32(4, 0x0100007f, true); // 127.0.0.1

  const fd = fn.socket.invoke(2, 1, 0);
  let up = false;

  if (fd !== -1) {
    up = fn.connect.invoke(fd, sa, 0x10) !== -1;
    fn.close.invoke(fd);
  }

  mem.free(sa_ab);
  return up;
}

async function autoload_pldmgr() {
  logger.info('Loading payload...');

  const elf = await load_file('src/ps5/pldmgr.elf');
  const src = elf.buffer.data();
  const size = elf.length;

  if (!fn.connect) {
    fn.connect = new NativeFunction(0x62, 'number'); // connect(2)
  }

  // struct sockaddr_in { len, family, port(BE), addr, zero[8] }
  const [sa_ab, sa] = mem.alloc(0x10, true);
  mem.bset(sa, 0x10, 0);
  const view = arw.view(sa);
  view.setUint8(0, 0x10); // sin_len
  view.setUint8(1, 2); // AF_INET
  view.setUint16(2, 9021, false); // sin_port, network order
  view.setUint32(4, 0x0100007f, true); // 127.0.0.1

  // El elfldr tarda un momento en quedar a la escucha: reintentamos.
  let fd = -1;
  for (let attempt = 0; attempt < 20 && fd === -1; attempt++) {
    fd = fn.socket.invoke(2, 1, 0); // AF_INET, SOCK_STREAM
    if (fd === -1) {
      throw new Error('unable to create socket');
    }

    if (fn.connect.invoke(fd, sa, 0x10) === -1) {
      fn.close.invoke(fd);
      fd = -1;
      await sleep(250);
    }
  }

  if (fd === -1) {
    throw new Error('elfldr is not listening on port 9021');
  }

  let offset = 0;
  while (offset < size) {
    const chunk = Math.min(0x10000, size - offset);
    const written = fn.write.invoke(fd, src.add(offset), chunk);

    if (written.i <= 0) {
      fn.close.invoke(fd);
      throw new Error('elfldr socket write failed');
    }

    offset += written.i;
  }

  fn.close.invoke(fd);
  mem.free(sa_ab);

  await sleep(2000);
  logger.info('Payload loaded');
}
