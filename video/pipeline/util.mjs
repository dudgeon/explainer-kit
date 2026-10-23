import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const sha = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' ? p : JSON.stringify(p)).update('\0');
  return h.digest('hex').slice(0, 16);
};
export const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
export class BuildError extends Error {}
