import { describe, expect, it } from 'vitest';
import { parseChartRegistryVersionSnapshot } from './registry';

const SNAPSHOT = {
    slug: 'vega-trellis',
    name: 'Vega Trellis',
    description: 'Small multiples',
    version: '0.6.0',
    publishedAt: '2026-10-01T00:00:00.000Z',
    tags: ['vega'],
    changelog: 'Fixes',
    minLightdashVersion: null,
    vizSchema: { fields: [], configOptions: [], colorPalette: null },
    preview: null,
    screenshots: [{ fileName: 'screenshot-1.png' }],
    thumbnailDark: { fileName: 'thumbnail-dark.png' },
    icon: null,
    artifacts: {
        source: { sha256: 'a'.repeat(64) },
        dist: { sha256: 'b'.repeat(64) },
    },
};

describe('parseChartRegistryVersionSnapshot', () => {
    it('reconstructs artifact and image paths under charts/<slug>/<version>', () => {
        const entry = parseChartRegistryVersionSnapshot(SNAPSHOT, {
            slug: 'vega-trellis',
            version: '0.6.0',
        });
        expect(entry.artifacts).toEqual({
            source: {
                path: 'charts/vega-trellis/0.6.0/source.tar',
                sha256: 'a'.repeat(64),
            },
            dist: {
                path: 'charts/vega-trellis/0.6.0/dist.tar',
                sha256: 'b'.repeat(64),
            },
        });
        expect(entry.thumbnail).toBe(
            'charts/vega-trellis/0.6.0/screenshot-1.png',
        );
        expect(entry.thumbnailDark).toBe(
            'charts/vega-trellis/0.6.0/thumbnail-dark.png',
        );
        expect(entry.screenshots).toEqual([
            'charts/vega-trellis/0.6.0/screenshot-1.png',
        ]);
        expect(entry.version).toBe('0.6.0');
    });

    it('nulls thumbnails when the snapshot has no screenshots or dark variant', () => {
        const entry = parseChartRegistryVersionSnapshot(
            { ...SNAPSHOT, screenshots: [], thumbnailDark: undefined },
            { slug: 'vega-trellis', version: '0.6.0' },
        );
        expect(entry.thumbnail).toBeNull();
        expect(entry.thumbnailDark).toBeNull();
        expect(entry.screenshots).toEqual([]);
    });

    it('rejects a snapshot whose slug or version differs from the requested one', () => {
        expect(() =>
            parseChartRegistryVersionSnapshot(SNAPSHOT, {
                slug: 'heatmap',
                version: '0.6.0',
            }),
        ).toThrow(/heatmap/);
        expect(() =>
            parseChartRegistryVersionSnapshot(SNAPSHOT, {
                slug: 'vega-trellis',
                version: '0.5.0',
            }),
        ).toThrow(/0\.5\.0/);
    });

    it('rejects a malformed snapshot', () => {
        expect(() =>
            parseChartRegistryVersionSnapshot(
                { ...SNAPSHOT, artifacts: { source: { sha256: 'nope' } } },
                { slug: 'vega-trellis', version: '0.6.0' },
            ),
        ).toThrow();
    });
});
