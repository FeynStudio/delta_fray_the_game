import { resolve } from 'node:path';
import { checkTree, report } from '../../../scripts/home-paths.mjs';

const { lines, code } = report(checkTree(resolve(process.argv[2])));
for (const line of lines) process.stdout.write(line + '\n');
process.exit(code);
