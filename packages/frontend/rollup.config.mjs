import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import svgr from '@svgr/rollup';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { resolve } from 'path';
import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import postcss from 'rollup-plugin-postcss';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const sdkPackageJson = JSON.parse(
    readFileSync(resolve(__dirname, 'sdk', 'package.json'), 'utf-8'),
);

// Externalize react + peer-adjacent paths. Everything else gets inlined by
// @rollup/plugin-commonjs via eager CJS→ESM transformation — no runtime
// require() calls survive in the output (unlike rolldown's __commonJSMin
// wrappers). This is what lets the SDK load under Turbopack and isolated
// Vite consumers. See issue #22289.
const external = (id) =>
    id === 'react' ||
    id === 'react-dom' ||
    id === 'react-dom/server' ||
    id === 'react/jsx-runtime' ||
    id === 'react/jsx-dev-runtime' ||
    id.startsWith('react/') ||
    id.startsWith('react-dom/');

// `import Foo from '…/foo.svg?react'` is a vite-plugin-svgr convention.
// @svgr/rollup doesn't understand the `?react` suffix, so strip it at
// resolveId time and let the trailing `.svg` route through svgr normally.
const stripSvgrQuery = () => ({
    name: 'strip-svgr-query',
    async resolveId(source, importer) {
        if (source.endsWith('?react')) {
            const cleaned = source.slice(0, -'?react'.length);
            const resolved = await this.resolve(cleaned, importer, {
                skipSelf: true,
            });
            return resolved ?? cleaned;
        }
        return null;
    },
});

// Quiet noisy "Module level directives cause errors when bundled" warnings
// for `"use client"` in third-party deps — those directives are meaningful
// to React server components but inert in our bundled SDK output.
const onwarn = (warning, warn) => {
    if (
        warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
        warning.message?.includes('"use client"')
    ) {
        return;
    }
    warn(warning);
};

const sdkInput = resolve(__dirname, 'sdk', 'index.tsx');
const distDir = resolve(__dirname, 'sdk', 'dist');

// Rollup has no `emptyOutDir` equivalent — wipe dist at build start so
// we don't publish stale outputs from prior builds (e.g. when output
// file names change between revisions). Attached only to the main
// build; the dts build runs second and fills in sdk.d.ts afterwards.
const cleanDist = () => ({
    name: 'clean-dist',
    async buildStart() {
        await rm(distDir, { recursive: true, force: true });
    },
});

// Main JS build (CJS + ESM). rollup-plugin-dts runs in the follow-up
// config entry below to emit sdk.d.ts.
const mainBuild = {
    input: sdkInput,
    external,
    onwarn,
    output: [
        {
            file: resolve(distDir, 'sdk.es.js'),
            format: 'es',
            sourcemap: true,
            inlineDynamicImports: true,
        },
        {
            file: resolve(distDir, 'sdk.cjs.js'),
            format: 'cjs',
            sourcemap: true,
            inlineDynamicImports: true,
            exports: 'named',
        },
    ],
    plugins: [
        cleanDist(),
        replace({
            preventAssignment: true,
            values: {
                __APP_VERSION__: JSON.stringify(
                    process.env.npm_package_version,
                ),
                __SDK_VERSION__: JSON.stringify(sdkPackageJson.version),
                'process.env.NODE_ENV': JSON.stringify('production'),
                // Some source files reference Vite-only globals (import.meta.env.*).
                // These resolve to `undefined` in non-Vite consumer bundlers and
                // cause runtime TypeErrors. Substitute known-safe literals at
                // build time. VITEST is the vitest runner flag; BASE_URL is the
                // vite dev server base path — neither is meaningful in the
                // shipped SDK.
                'import.meta.env.VITEST': JSON.stringify('false'),
                'import.meta.env.BASE_URL': JSON.stringify('/'),
                'import.meta.env.DEV': 'false',
                'import.meta.env.VITE_SENTRY_SPOTLIGHT': 'undefined',
            },
        }),
        stripSvgrQuery(),
        svgr({ exportType: 'default' }),
        // Some transitive deps (pegjs, ajv, others) reference Node built-ins
        // like fs/path/url. These code paths are dead in a browser bundle,
        // but @rollup/plugin-commonjs preserves the imports. Shim them with
        // browser-safe empty/polyfilled versions so consumer bundlers don't
        // trip on Module-not-found errors.
        nodePolyfills(),
        postcss({
            extract: false,
            inject: true,
            // `modules: true` would hash classNames in every CSS file, which
            // breaks Mantine's global styles (its components expect literal
            // class names like .mantine-Button-root). Use autoModules so
            // only *.module.css gets the CSS-modules treatment.
            autoModules: true,
            minimize: true,
        }),
        json(),
        nodeResolve({
            browser: true,
            preferBuiltins: false,
            extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
        }),
        commonjs({
            transformMixedEsModules: true,
            requireReturnsDefault: 'auto',
        }),
        esbuild({
            jsx: 'automatic',
            target: 'es2020',
            tsconfig: resolve(__dirname, 'tsconfig.json'),
        }),
    ],
};

// Bundled .d.ts emit.
//
// KNOWN LIMITATION — MATCHES PRIOR BEHAVIOR: the emitted sdk.d.ts
// externalizes all imports, which means consumers see dangling imports
// for `@lightdash/common` and `../src/ee/...` source paths that don't
// exist in the published tarball. This is identical to what the prior
// vite-plugin-dts(rollupTypes: true) config emitted — the types have
// shipped in this state since before the rolldown transition.
//
// Fully inlining transitive types is blocked by rollup-plugin-dts'
// TypeScript wrapper not parsing CJS-style d.ts from several
// @lightdash/common transitive deps (dependency-graph, echarts, etc.).
// Proper fix requires either switching to api-extractor or tsdown, or
// adding @lightdash/common as a peer dependency so consumer projects
// resolve the types. Tracked as a follow-up to not balloon this PR.
const dtsBuild = {
    input: sdkInput,
    external: () => true,
    output: {
        file: resolve(distDir, 'sdk.d.ts'),
        format: 'es',
    },
    plugins: [
        dts({
            respectExternal: true,
            tsconfig: resolve(__dirname, 'tsconfig.json'),
            compilerOptions: {
                noEmit: false,
                declaration: true,
                emitDeclarationOnly: true,
            },
        }),
    ],
};

export default [mainBuild, dtsBuild];
