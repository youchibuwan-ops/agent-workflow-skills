import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {realpathSync} from 'node:fs';
export function resolveDshRuntime(runtimeRoot){
  const require=createRequire(resolve(runtimeRoot,'package.json'));
  const installAnchor=realpathSync(require.resolve('@deepseek-ai/dsh/package.json'));
  return {installAnchor,bin:resolve(dirname(installAnchor),'lib/bin.js'),load:specifier=>import(pathToFileURL(realpathSync(require.resolve(specifier))).href)};
}
export const runtimeImporter=root=>resolveDshRuntime(root).load;
export const runtimeBin=root=>resolveDshRuntime(root).bin;
