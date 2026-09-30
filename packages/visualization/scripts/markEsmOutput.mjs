// The ESM build is emitted as .js next to a CommonJS package.json, so Node
// would read it as CommonJS. A nested manifest marks the folder as modules,
// which lets `import` resolve to the ESM build in Node and in bundlers alike.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
writeFileSync(
    join(packageDir, 'dist', 'esm', 'package.json'),
    `${JSON.stringify({ type: 'module', sideEffects: false }, null, 4)}\n`,
);
