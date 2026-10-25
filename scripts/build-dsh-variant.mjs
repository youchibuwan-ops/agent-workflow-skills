import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'skills/proactive-skill-discovery');
const target = join(root, 'skills/proactive-skill-discovery-dsh');
const check = process.argv.includes('--check');
const entries = readdirSync(source, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((file) => !relative(source, file).replaceAll('\\', '/').startsWith('agents/'));
for (const file of entries) {
  const destination = join(target, relative(source, file));
  let content = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (relative(source, file) === 'SKILL.md') {
    content = content.replace('name: proactive-skill-discovery\n', 'name: proactive-skill-discovery-dsh\n')
      .replace(/^description: .+$/m,
        'description: Use in DeepSeek Harness at the start of a new authorized task, or when requirements, evidence, capability gaps, repeated failures, or reusable lessons need reassessment.')
      .replace('# 主动发现、使用与沉淀 Skill',
        '# 主动发现、使用与沉淀 Skill · DSH\n\n在 DeepSeek Harness 中使用时，先读[DSH 宿主适配](references/dsh-host.md)，再执行以下同一套任务流程。');
  }
  if (check) {
    assert.equal(readFileSync(destination, 'utf8'), content, `DSH variant is stale: ${destination}`);
  } else {
    mkdirSync(dirname(destination), { recursive: true });
    if (relative(source, file) === 'LICENSE') copyFileSync(file, destination);
    else writeFileSync(destination, content);
  }
}
assert(existsSync(join(target, 'references/dsh-host.md')), 'Missing DSH host adaptation');
assert(!existsSync(join(target, 'agents/openai.yaml')), 'Do not imply Codex UI metadata controls DSH');
console.log(check ? 'DSH variant matches the canonical workflow and resources' : 'DSH variant generated');
