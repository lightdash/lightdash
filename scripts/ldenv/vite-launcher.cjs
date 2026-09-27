require('tsx/cjs');
const path = require('node:path');
const { runViteCache } = require('./vite-runtime.ts');

async function main() {
    const [action = 'serve', requestedRoot, parentRoot] = process.argv.slice(2);
    const root = path.resolve(
        requestedRoot ||
            process.env.LDENV_WORKTREE ||
            path.join(process.cwd(), '../..'),
    );
    const viteRoot = require('node:fs').realpathSync(
        path.join(root, 'packages/frontend/node_modules/vite'),
    );
    process.env.NODE_PATH = [
        path.join(viteRoot, 'node_modules'),
        path.dirname(viteRoot),
        path.join(root, 'node_modules/.pnpm/node_modules'),
        process.env.NODE_PATH,
    ]
        .filter(Boolean)
        .join(path.delimiter);
    require('node:module').Module._initPaths();
    process.env.NODE_ENV = 'development';
    process.chdir(path.join(root, 'packages/frontend'));
    if (action === 'serve') {
        const { serveVite } = require('./vite-prewarm.ts');
        await serveVite(root);
    } else if (['populate', 'restore'].includes(action)) {
        const result = await runViteCache(action, root, parentRoot || null);
        process.stdout.write(`LDENV_VITE_RESULT=${JSON.stringify(result)}\n`);
    } else throw new Error(`Unknown Vite action: ${action}`);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
