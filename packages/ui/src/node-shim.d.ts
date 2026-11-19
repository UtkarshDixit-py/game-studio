// Minimal test-only declaration for the one Node API the token parity test
// uses. The repository intentionally keeps @types/node out of the workspace.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
