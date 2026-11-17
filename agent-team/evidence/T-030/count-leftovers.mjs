#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const mark = 'galaxy-smoke-';
const waitSeconds = Number(process.argv[2] ?? 0);
await new Promise((done) => setTimeout(done, waitSeconds * 1000));
const listed = execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  'Get-CimInstance Win32_Process | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const all = [].concat(JSON.parse(listed));
const processes = all.filter((p) => (p.CommandLine ?? '').includes(mark));
const folders = readdirSync(tmpdir()).filter((name) => name.startsWith(mark));
process.stdout.write(`counted at ${new Date().toISOString()} after waiting ${waitSeconds} s; ${all.length} processes listed; temp dir <OS temp dir>\n`);
process.stdout.write(`processes with ${mark} in the command line: ${processes.length}\n`);
for (const p of processes) process.stdout.write(`  ${p.ProcessId} ${p.Name} ${p.CommandLine}\n`);
process.stdout.write(`folders named ${mark}* in the temp dir: ${folders.length}\n`);
for (const name of folders) process.stdout.write(`  ${name}\n`);
