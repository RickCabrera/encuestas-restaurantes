// Arranque de la app en la versión instalada en PC: lo ejecuta el servicio de Windows en
// lugar de server.js (queda junto a él, en la carpeta app\).
//
// En la PC no hay proxy delante: lo que un cliente mande en x-forwarded-for es inventado.
// Aquí se reemplaza por la IP real de la conexión, de modo que la app (límites por IP y la
// ruta /inicio, que solo atiende a la propia PC) pueda confiar en ese header.

// CommonJS a propósito: server.js (el que genera Next) también lo es y se carga con require.
/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");

const createServer = http.createServer;
http.createServer = function (...args) {
  const index = args.findIndex((arg) => typeof arg === "function");
  if (index >= 0) {
    const listener = args[index];
    args[index] = function (req, res) {
      delete req.headers["x-real-ip"];
      delete req.headers["forwarded"];
      req.headers["x-forwarded-for"] = req.socket.remoteAddress || "";
      return listener.call(this, req, res);
    };
  }
  return createServer.apply(this, args);
};

process.env.LOCAL_TRUSTED_REMOTE = "1";
require("./server.js");
