import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
export function runtimeImporter(runtimeRoot=import.meta.dirname) {
  const require=createRequire(resolve(runtimeRoot,'package.json'));
  return spec=>import(pathToFileURL(require.resolve(spec)).href);
}
export function runtimeBin(runtimeRoot=import.meta.dirname) {
  const require=createRequire(resolve(runtimeRoot,'package.json'));
  return resolve(dirname(require.resolve('@deepseek-ai/dsh/package.json')),'lib/bin.js');
}
