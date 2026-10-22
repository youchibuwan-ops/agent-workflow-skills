import { globSync, readFileSync } from 'node:fs';
import { lint } from 'markdownlint/sync';

const files = [...globSync('**/*.md', {
  exclude: ['**/node_modules/**', '.agents/**', '.venv/**', 'dist/**'],
})].sort();
const results = lint({ files, config: JSON.parse(readFileSync('.markdownlint.json')) });
const failures = Object.entries(results).flatMap(([file, errors]) =>
  errors.map((error) => `${file}:${error.lineNumber} ${error.ruleNames[0]} ${error.ruleDescription}: ${error.errorDetail || ''}`));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`markdownlint: ${files.length} files, 0 errors`);
}
