// Fill src/hhpanda/constants.js RESOLVER_BASE with this PC's current LAN IP.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const constantsPath = path.join(here, '..', 'src', 'hhpanda', 'constants.js');

const ip = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address)[0];

if (!ip) {
  console.error('No LAN IPv4 found.');
  process.exit(1);
}

let src = fs.readFileSync(constantsPath, 'utf8');
src = src.replace(/export const RESOLVER_BASE = '[^']*';/, `export const RESOLVER_BASE = 'http://${ip}:7777';`);
fs.writeFileSync(constantsPath, src);
console.log(`RESOLVER_BASE -> http://${ip}:7777`);
console.log('Now rebuild the provider:  node build.js hhpanda');
