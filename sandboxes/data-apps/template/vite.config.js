import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import { parseSync } from 'oxc-parser';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Build a binary-searchable index of newline offsets so we can map JSX
 * element start offsets to 1-indexed line numbers without scanning the
 * whole file once per element.
 */
function buildLineIndex(code) {
    const idx = [0];
    for (let i = 0; i < code.length; i += 1) {
        if (code.charCodeAt(i) === 10) idx.push(i + 1);
    }
    return idx;
}

function offsetToLine(lineIdx, offset) {
    let lo = 0;
    let hi = lineIdx.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineIdx[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return lo + 1;
}

function walkAst(node, fn) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const child of node) walkAst(child, fn);
        return;
    }
    if (typeof node.type === 'string') fn(node);
    for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        walkAst(node[key], fn);
    }
}

function alreadyHasDataLoc(opening) {
    return opening.attributes?.some(
        (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name?.type === 'JSXIdentifier' &&
            attr.name?.name === 'data-loc',
    );
}

/**
 * Annotate every JSX opening element with `data-loc="<rel-path>:<line>"`
 * by parsing with oxc and splicing attributes into the source string.
 *
 * Why both lowercase tags AND capitalized React components get annotated:
 * shadcn primitives spread `{...props}` onto their root element, so when
 * Dashboard.tsx renders <Button>, the data-loc from the call site is
 * passed as a prop and spread last — overriding the data-loc the visitor
 * injected inside button.tsx. The DOM ends up with the caller's loc, which
 * is what Claude needs to edit. Components that don't spread props
 * silently drop the attribute, and the inspector falls back to the closest
 * ancestor that does carry one.
 *
 * Returns null on parse error so Vite re-loads the file and OXC produces
 * its own (better) diagnostic.
 */
function annotateJsx(code, filename, relPath) {
    const lang = filename.endsWith('.tsx') ? 'tsx' : 'jsx';
    const result = parseSync(filename, code, { sourceType: 'module', lang });
    if (result.errors?.length) return null;

    const targets = [];
    walkAst(result.program, (node) => {
        if (node.type !== 'JSXOpeningElement') return;
        if (!node.name) return;
        if (alreadyHasDataLoc(node)) return;
        targets.push(node);
    });
    if (targets.length === 0) return null;

    const lineIdx = buildLineIndex(code);
    // Splice in reverse so each insertion's offset stays valid against the
    // original positions reported by the parser.
    targets.sort((a, b) => b.name.end - a.name.end);
    let out = code;
    for (const node of targets) {
        const line = offsetToLine(lineIdx, node.start);
        const insertion = ` data-loc="${relPath}:${line}"`;
        out = out.slice(0, node.name.end) + insertion + out.slice(node.name.end);
    }
    return out;
}

/**
 * Vite plugin that stamps `data-loc` on every JSX opening element BEFORE
 * @vitejs/plugin-react v6's OXC-based JSX transform sees the file. The
 * Lightdash element inspector reads `data-loc` via `closest('[data-loc]')`
 * to map a clicked DOM node back to its source line, so iteration prompts
 * can target the exact component the user pointed at.
 *
 * Why `load` and not `transform`: Vite 8 + Rolldown processes user JSX/TSX
 * files through the native OXC pipeline and skips the `transform` hook for
 * them. `load` still fires (so Vite knows the source), so we read +
 * annotate + return the modified source for OXC to pick up.
 *
 * Why oxc-parser instead of @babel/core: oxc-parser is the same engine
 * already in the stack (via Rolldown), no JS-side codegen is needed
 * because we splice text by character offset, and the Babel dep weight
 * isn't worth carrying for one transform.
 */
function jsxSourceLocVitePlugin() {
    let cwd = process.cwd();
    return {
        name: 'lightdash-jsx-source-loc',
        configResolved(config) {
            cwd = config.root;
        },
        async load(id) {
            // Strip query strings vite sometimes appends (e.g. ?v=123).
            const filename = id.split('?')[0];
            if (!/\.(jsx|tsx)$/.test(filename)) return null;

            const srcDir = path.join(cwd, 'src') + path.sep;
            if (!filename.startsWith(srcDir)) return null;

            const code = await fs.readFile(filename, 'utf-8');

            // Cheap out: nothing JSX-ish to annotate. Return null so Vite
            // re-reads via its own loader rather than us shadowing it with
            // an opinion-free `code`.
            if (!/<[A-Za-z]/.test(code)) return null;

            const relPath = path
                .relative(cwd, filename)
                .replace(/\\/g, '/');
            const annotated = annotateJsx(code, filename, relPath);
            return annotated ?? code;
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');

    return {
        plugins: [jsxSourceLocVitePlugin(), react()],
        base: './',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            proxy: {
                '/api': {
                    target:
                        env.VITE_LIGHTDASH_URL || 'https://app.lightdash.cloud',
                    changeOrigin: true,
                    secure: true,
                },
            },
        },
    };
});
