import {
    chartRegistryIndexSchema,
    isSemverVersion,
    type ChartRegistryEntry,
    type ChartRegistryIndex,
    type DataAppVizSchema,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pack } from 'tar-stream';

/**
 * Builds a local chart-registry fixture on disk: one chart ("fixture-gauge")
 * with a real source.tar / dist.tar, a 1x1 PNG thumbnail/screenshot, and an
 * index.json validated against the same schema the backend's
 * ChartRegistryClient parses. Used by the unit test below and by
 * `scripts/dev-chart-registry.mjs`, which imports this module directly via
 * `tsx` and serves the output over HTTP for manual/E2E install testing.
 *
 * Kept dependency-free (node builtins + tar-stream, already a direct backend
 * dependency) so it doubles as the seed of the future charts-repo publish
 * script.
 */

const FIXTURE_SLUG = 'fixture-gauge';
const FIXTURE_NAME = 'Fixture Gauge';

const FIXTURE_VIZ_SCHEMA: DataAppVizSchema = {
    fields: [
        { name: 'value', label: 'Value', type: 'metric', required: true },
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: false,
        },
    ],
    configOptions: [],
    colorPalette: null,
};

// 1x1 transparent PNG, reused for both the thumbnail and the screenshot —
// only its presence/content-type matters for the gallery/asset-proxy checks.
const ONE_PX_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const SOURCE_APP_JSX = `export default function App() { return null; }\n`;

// Genuinely renderable: shows a placeholder immediately, then runs the same
// handshake @lightdash/query-sdk's useVizContext runs (packages/query-sdk/src/vizContext.ts):
// listen for the host's push, then ask for it. The host's listener
// (useAppSdkBridge.ts) is registered unconditionally on iframe mount and
// replies to the request with no sdk:ready/sdk:manifest gate in between, so
// no boot handshake beyond this pair is needed. All JS lives here — none
// inline in index.html — because the preview iframe's CSP `script-src` has
// no `'unsafe-inline'` (see appPreviewRouter.ts's buildCspHeader), only
// `'self'`/the preview origin/blob:, matching what a same-origin external
// file needs.
const DIST_ASSET_APP_JS = `const root = document.getElementById('root');

function render(text) {
  root.textContent = text;
}

render('Fixture Gauge');

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'lightdash:sdk:data-app-viz-context') return;
  const fieldMapping = data.fieldMapping || {};
  const fieldNames = Object.keys(fieldMapping);
  const rowCount = Array.isArray(data.rows) ? data.rows.length : 0;
  render(
    'Fixture Gauge \\u2014 fields: ' +
      (fieldNames.length ? fieldNames.join(', ') : '(none)') +
      ', rows: ' +
      rowCount,
  );
});

window.parent?.postMessage({ type: 'lightdash:sdk:viz-context-request' }, '*');
`;

// `type="module" crossorigin` matches the tag shape a real Vite build emits
// (Vite's `base: './'` output) — module scripts are always CORS-mode
// fetches, which is what the real template relies on when assets are served
// from a CDN origin distinct from the document (see buildCspHeader's
// `cdnOrigin`); harmless for same-origin dev serving.
const DIST_INDEX_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Fixture Gauge</title></head>
<body>
<div id="root">Fixture Gauge</div>
<script type="module" crossorigin src="./assets/app.js"></script>
</body>
</html>
`;

/** Packs a list of {name, content} entries into a tar buffer via tar-stream. */
function packTar(
    entries: { name: string; content: string }[],
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const packer = pack();
        const chunks: Buffer[] = [];
        packer.on('data', (chunk: Buffer) => chunks.push(chunk));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);

        const addNext = (index: number): void => {
            if (index >= entries.length) {
                packer.finalize();
                return;
            }
            const entry = entries[index];
            packer.entry({ name: entry.name }, entry.content, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                addNext(index + 1);
            });
        };
        addNext(0);
    });
}

const sha256Hex = (buffer: Buffer): string =>
    createHash('sha256').update(buffer).digest('hex');

export type BuildChartRegistryFixtureArgs = {
    /** Directory the fixture is written into (created if missing). */
    outDir: string;
    /** Strict x.y.z. Bump this to exercise the upgrade flow. */
    version?: string;
};

export type BuildChartRegistryFixtureResult = {
    /** The validated index — same shape ChartRegistryClient parses. */
    index: ChartRegistryIndex;
    /** Absolute path to the written index.json. */
    indexPath: string;
};

export async function buildChartRegistryFixture({
    outDir,
    version = '1.0.0',
}: BuildChartRegistryFixtureArgs): Promise<BuildChartRegistryFixtureResult> {
    if (!isSemverVersion(version)) {
        throw new Error(
            `buildChartRegistryFixture: version "${version}" must be a strict x.y.z semver string`,
        );
    }

    const relPrefix = `charts/${FIXTURE_SLUG}/${version}`;
    const chartDir = path.join(outDir, ...relPrefix.split('/'));
    await mkdir(chartDir, { recursive: true });

    const sourceTar = await packTar([
        { name: 'src/App.jsx', content: SOURCE_APP_JSX },
    ]);
    const distTar = await packTar([
        { name: 'dist/index.html', content: DIST_INDEX_HTML },
        { name: 'dist/assets/app.js', content: DIST_ASSET_APP_JS },
    ]);
    const thumbnailPng = Buffer.from(ONE_PX_PNG_BASE64, 'base64');

    await Promise.all([
        writeFile(path.join(chartDir, 'source.tar'), sourceTar),
        writeFile(path.join(chartDir, 'dist.tar'), distTar),
        writeFile(path.join(chartDir, 'thumb.png'), thumbnailPng),
        writeFile(path.join(chartDir, 'screenshot-1.png'), thumbnailPng),
    ]);

    const changelog =
        version === '1.0.0' ? 'Initial fixture release.' : 'Fixture upgrade';

    const entry: ChartRegistryEntry = {
        slug: FIXTURE_SLUG,
        name: FIXTURE_NAME,
        description:
            'Dev/E2E fixture chart type — a minimal renderer used to validate the chart registry install/upgrade flow locally.',
        version,
        publishedAt: new Date().toISOString(),
        tags: ['fixture'],
        changelog,
        minLightdashVersion: null,
        vizSchema: FIXTURE_VIZ_SCHEMA,
        thumbnail: `${relPrefix}/thumb.png`,
        screenshots: [`${relPrefix}/screenshot-1.png`],
        artifacts: {
            source: {
                path: `${relPrefix}/source.tar`,
                sha256: sha256Hex(sourceTar),
            },
            dist: {
                path: `${relPrefix}/dist.tar`,
                sha256: sha256Hex(distTar),
            },
        },
    };

    const index: ChartRegistryIndex = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        charts: [entry],
    };

    // Throws on anything that wouldn't also parse inside ChartRegistryClient.
    const validated = chartRegistryIndexSchema.parse(index);

    const indexPath = path.join(outDir, 'index.json');
    await writeFile(indexPath, JSON.stringify(validated, null, 2));

    return { index: validated, indexPath };
}
