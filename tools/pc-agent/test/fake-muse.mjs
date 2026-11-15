// Stand-in for `muse exec` in tests. Speaks the same JSONL events and acts on
// markers inside the prompt file:
//   WRITE:<relative path>   create/overwrite that file in the workspace
//   SLEEP:<ms>              wait before finishing (timeout / stop tests)
//   FAIL                    end with a failed terminal event
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
if (args[0] === 'usage') {
  process.stdout.write('Tier: Test\nWindow: 7% used, resets in 2h\nWeekly: ' + (process.env.FAKE_MUSE_WEEKLY || '53') + '% used, resets in 12h\n');
  process.exit(0);
}
const prompt = readFileSync(arg('--prompt-file'), 'utf8');
const workspace = arg('--workspace');
const emit = (payload_type, payload) => process.stdout.write(JSON.stringify({ schema_version: 1, payload_type, payload }) + '\n');

emit('run.lifecycle.started', { kind: 'run_started' });
const canWrite = !args.includes('--disable-write');
for (const m of prompt.matchAll(/WRITE:(\S+)/g)) {
  emit('task.lifecycle.started', { kind: 'task_lifecycle' });
  if (canWrite) {
    const target = join(workspace, m[1]);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `written by fake muse for ${m[1]}\n`);
  }
}
const sleep = /SLEEP:(\d+)/.exec(prompt);
if (sleep) await new Promise((resolve) => setTimeout(resolve, Number(sleep[1])));
if (prompt.includes('FAIL')) {
  emit('run.terminal.failed', { kind: 'run_terminal', terminal: 'failed', text: '', reason: 'model refused' });
  process.exit(1);
}
const text = 'Fake change title\n- did the thing\n- tests: ok';
emit('run.output.delta', { kind: 'run_output_delta', text });
emit('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', text, reason: null });
