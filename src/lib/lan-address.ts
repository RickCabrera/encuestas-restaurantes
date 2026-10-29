import dgram from "node:dgram";
import os from "node:os";

/**
 * IP de la PC en la red local, para la versión instalada en PC (APP_MODE=local).
 *
 * El router puede darle otra IP a la PC (DHCP). Si la app solo usara APP_URL, el panel, los QR
 * y la "Dirección para las tablets" seguirían mostrando la IP vieja. Aquí se calcula la actual.
 */

type Interfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

// Adaptadores que no son la red del restaurante: máquinas virtuales, VPN, WSL, Docker...
const VIRTUAL =
  /(vethernet|virtualbox|vbox|vmware|hyper-v|docker|wsl|loopback|tailscale|zerotier|hamachi|vpn|tap-|tun|utun|bluetooth|npcap)/i;

export function isPrivateIPv4(ip: string) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function rank(ip: string) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  return 2;
}

/** IPs privadas IPv4 de la PC: primero los adaptadores físicos, y entre ellos 192.168 > 10 > 172. */
export function lanCandidates(interfaces: Interfaces) {
  const found: { ip: string; virtual: boolean }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      // Node 18.0–18.3 reportaba family como número.
      const v4 = info.family === "IPv4" || (info.family as unknown) === 4;
      if (!v4 || info.internal || !isPrivateIPv4(info.address)) continue;
      found.push({ ip: info.address, virtual: VIRTUAL.test(name) });
    }
  }
  return found.sort((x, y) => Number(x.virtual) - Number(y.virtual) || rank(x.ip) - rank(y.ip));
}

/**
 * Elige la IP a anunciar. Orden: la que trae la petición (si la persona entró por una IP de
 * esta PC, esa funciona), la de APP_URL si sigue siendo de esta PC, la de la ruta por defecto
 * y, al final, la primera física. null si la PC no tiene red local.
 */
export function pickLanAddress(opts: {
  interfaces: Interfaces;
  hostIp?: string | null;
  configuredIp?: string | null;
  routedIp?: string | null;
}) {
  const candidates = lanCandidates(opts.interfaces);
  const mine = new Set(candidates.map((c) => c.ip));
  for (const ip of [opts.hostIp, opts.configuredIp, opts.routedIp]) {
    if (ip && mine.has(ip)) return ip;
  }
  const physical = candidates.find((c) => !c.virtual);
  return physical?.ip ?? candidates[0]?.ip ?? null;
}

let routedCache: { ip: string | null; at: number } | null = null;
const ROUTED_TTL_MS = 30_000;

/**
 * IP local con la que la PC sale a la red (la del adaptador de la ruta por defecto). Un socket
 * UDP "conectado" no envía nada: solo pide al sistema qué dirección local usaría.
 */
export async function routedAddress(): Promise<string | null> {
  if (routedCache && Date.now() - routedCache.at < ROUTED_TTL_MS) return routedCache.ip;
  const ip = await new Promise<string | null>((resolve) => {
    let done = false;
    const socket = dgram.createSocket("udp4");
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ya cerrado
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 500);
    socket.on("error", () => finish(null));
    try {
      socket.connect(53, "8.8.8.8", () => {
        try {
          finish(socket.address().address);
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }
  });
  routedCache = { ip, at: Date.now() };
  return ip;
}

export async function currentLanAddress(hostIp?: string | null, configuredIp?: string | null) {
  return pickLanAddress({
    interfaces: os.networkInterfaces(),
    hostIp,
    configuredIp,
    routedIp: await routedAddress(),
  });
}
