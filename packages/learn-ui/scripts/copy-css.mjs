// tsc emits JS and declarations only; CSS modules ship beside their
// components so consumers' bundlers (Vite in-app, esbuild on the academy)
// resolve `./X.module.css` from dist exactly as they do from src.
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const src = new URL('../src', import.meta.url).pathname;
const dist = new URL('../dist', import.meta.url).pathname;

const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });

for (const file of walk(src)) {
    if (!file.endsWith('.module.css')) continue;
    const target = join(dist, relative(src, file));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file, target);
}
