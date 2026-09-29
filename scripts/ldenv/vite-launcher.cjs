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
    let frontend;
    try {
        frontend = JSON.parse(
            require('node:fs').readFileSync(
                path.join(root, 'packages/frontend/package.json'),
                'utf8',
            ),
        );
    } catch {
        throw new Error('Cannot read target frontend package version');
    }
    if (typeof frontend.version !== 'string' || !frontend.version)
        throw new Error('Target frontend package version is missing');
    process.env.npm_package_version = frontend.version;
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
    } else if (['populate', 'restore', 'inspect'].includes(action)) {
        const result = await runViteCache(action, root, parentRoot || null);
        process.stdout.write(`LDENV_VITE_RESULT=${JSON.stringify(result)}\n`);
    } else throw new Error(`Unknown Vite action: ${action}`);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
