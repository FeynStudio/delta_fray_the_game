#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const MARK = 'galaxy-smoke-';
const IMAGE = 'chrome.exe';
const waitSeconds = Number(process.argv[2] ?? 0);
await new Promise((done) => setTimeout(done, waitSeconds * 1000));
const listed = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${IMAGE}`, '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true });
const processes = listed.split(/\r?\n/).filter((line) => line.startsWith(`"${IMAGE}"`)).length;
const folders = readdirSync(tmpdir()).filter((name) => name.startsWith(MARK)).length;
process.stdout.write(`counted ${new Date().toISOString()} after waiting ${waitSeconds} s: ${MARK}* folders in the OS temp dir ${folders}; ${IMAGE} processes ${processes}\n`);
