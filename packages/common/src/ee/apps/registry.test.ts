import { describe, expect, it } from 'vitest';
import {
    chartRegistryIndexSchema,
    compareSemverVersions,
    isSemverVersion,
} from './registry';

const validEntry = {
    slug: 'sankey',
    name: 'Sankey Diagram',
    description: 'Flow between categories',
    version: '1.2.0',
    publishedAt: '2026-08-31T00:00:00.000Z',
    tags: ['flow'],
    changelog: 'Initial release',
    minLightdashVersion: null,
    vizSchema: { fields: [], configOptions: [], colorPalette: null },
    thumbnail: 'charts/sankey/1.2.0/thumb.png',
    screenshots: ['charts/sankey/1.2.0/screenshot-1.png'],
    artifacts: {
        source: {
            path: 'charts/sankey/1.2.0/source.tar',
            sha256: 'a'.repeat(64),
        },
        dist: { path: 'charts/sankey/1.2.0/dist.tar', sha256: 'b'.repeat(64) },
    },
};

describe('chartRegistryIndexSchema', () => {
    it('parses a valid index', () => {
        const result = chartRegistryIndexSchema.safeParse({
            schemaVersion: 1,
            generatedAt: '2026-08-31T00:00:00.000Z',
            charts: [validEntry],
        });
        expect(result.success).toBe(true);
    });
    it('rejects a non-semver version', () => {
        const result = chartRegistryIndexSchema.safeParse({
            schemaVersion: 1,
            generatedAt: '2026-08-31T00:00:00.000Z',
            charts: [{ ...validEntry, version: '1.2' }],
        });
        expect(result.success).toBe(false);
    });
    it('rejects an invalid slug', () => {
        const result = chartRegistryIndexSchema.safeParse({
            schemaVersion: 1,
            generatedAt: '2026-08-31T00:00:00.000Z',
            charts: [{ ...validEntry, slug: 'Bad_Slug' }],
        });
        expect(result.success).toBe(false);
    });
    it('rejects a bad sha256', () => {
        const entry = {
            ...validEntry,
            artifacts: {
                ...validEntry.artifacts,
                dist: { path: 'x', sha256: 'nope' },
            },
        };
        const result = chartRegistryIndexSchema.safeParse({
            schemaVersion: 1,
            generatedAt: '2026-08-31T00:00:00.000Z',
            charts: [entry],
        });
        expect(result.success).toBe(false);
    });
    it('rejects an unknown schemaVersion', () => {
        const result = chartRegistryIndexSchema.safeParse({
            schemaVersion: 2,
            generatedAt: '2026-08-31T00:00:00.000Z',
            charts: [],
        });
        expect(result.success).toBe(false);
    });
});

describe('compareSemverVersions', () => {
    it('orders numerically, not lexically', () => {
        expect(compareSemverVersions('1.10.0', '1.9.0')).toBe(1);
        expect(compareSemverVersions('1.2.0', '1.2.0')).toBe(0);
        expect(compareSemverVersions('0.9.9', '1.0.0')).toBe(-1);
    });
    it('throws on non-semver input', () => {
        expect(() => compareSemverVersions('1.2', '1.2.0')).toThrow();
    });
});

describe('isSemverVersion', () => {
    it('accepts x.y.z and rejects everything else', () => {
        expect(isSemverVersion('1.242.5')).toBe(true);
        expect(isSemverVersion('1.2')).toBe(false);
        expect(isSemverVersion('1.2.3-beta')).toBe(false);
    });
});
