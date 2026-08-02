import { type DbtManifest, type DbtNode } from '../types/dbt';
import {
    combineManifests,
    combineManifestSources,
    type ManifestSource,
} from './manifest';

const modelNode = (uniqueId: string, extra: Record<string, unknown> = {}) =>
    ({
        unique_id: uniqueId,
        resource_type: 'model',
        compiled: true,
        ...extra,
    }) as unknown as DbtNode;

const testNode = (uniqueId: string) =>
    ({
        unique_id: uniqueId,
        resource_type: 'test',
    }) as unknown as DbtNode;

const buildManifest = (
    nodes: Record<string, DbtNode>,
    overrides: Partial<DbtManifest> = {},
): DbtManifest =>
    ({
        nodes,
        metadata: {
            adapter_type: 'postgres',
        },
        metrics: {},
        docs: {},
        ...overrides,
    }) as unknown as DbtManifest;

const source = (
    name: string,
    precedence: number,
    manifest: DbtManifest,
): ManifestSource => ({ name, precedence, manifest });

describe('combineManifests (two-manifest wrapper)', () => {
    test('adds external-only model nodes and lists their unique_ids', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'primary' }),
        });
        const external = buildManifest({
            'model.proj.b': modelNode('model.proj.b'),
            'model.proj.c': modelNode('model.proj.c'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        expect(Object.keys(manifest.nodes).sort()).toEqual([
            'model.proj.a',
            'model.proj.b',
            'model.proj.c',
        ]);
        expect(addedModelIds.sort()).toEqual(['model.proj.b', 'model.proj.c']);
    });

    test('primary wins on conflict and does not list the conflicting id as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'primary' }),
        });
        const external = buildManifest({
            'model.proj.a': modelNode('model.proj.a', { tag: 'external' }),
            'model.proj.b': modelNode('model.proj.b'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        const mergedA = manifest.nodes['model.proj.a'] as unknown as {
            tag: string;
        };
        expect(mergedA.tag).toBe('primary');
        expect(addedModelIds).toEqual(['model.proj.b']);
    });

    test('external model nodes that were not compiled are merged but not reported as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a'),
        });
        const external = buildManifest({
            'model.proj.compiled': modelNode('model.proj.compiled', {
                compiled: true,
            }),
            'model.proj.uncompiled': modelNode('model.proj.uncompiled', {
                compiled: false,
            }),
            'model.proj.missing': modelNode('model.proj.missing', {
                compiled: undefined,
            }),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        // All external nodes are merged (so joins by name still resolve)
        expect(manifest.nodes['model.proj.uncompiled']).toBeDefined();
        expect(manifest.nodes['model.proj.missing']).toBeDefined();
        // ...but only the compiled one is reported as added
        expect(addedModelIds).toEqual(['model.proj.compiled']);
    });

    test('non-model external nodes are merged into nodes but not reported as added', () => {
        const primary = buildManifest({
            'model.proj.a': modelNode('model.proj.a'),
        });
        const external = buildManifest({
            'test.proj.t': testNode('test.proj.t'),
            'model.proj.b': modelNode('model.proj.b'),
        });

        const { manifest, addedModelIds } = combineManifests(primary, external);

        expect(manifest.nodes['test.proj.t']).toBeDefined();
        expect(addedModelIds).toEqual(['model.proj.b']);
    });

    // Inverted from the original CLI-only assertion ("metrics, docs, and metadata
    // come from primary only"). The locked multi-source decision unions metrics
    // and docs across sources; only metadata still comes from the primary.
    test('metrics and docs are unioned across manifests; metadata comes from primary', () => {
        const primary = buildManifest(
            { 'model.proj.a': modelNode('model.proj.a') },
            {
                metrics: {
                    'metric.proj.p': { id: 'p' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.proj.p': { id: 'p' },
                } as unknown as DbtManifest['docs'],
                metadata: {
                    adapter_type: 'postgres',
                } as unknown as DbtManifest['metadata'],
            },
        );
        const external = buildManifest(
            { 'model.proj.b': modelNode('model.proj.b') },
            {
                metrics: {
                    'metric.proj.e': { id: 'e' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.proj.e': { id: 'e' },
                } as unknown as DbtManifest['docs'],
                metadata: {
                    adapter_type: 'snowflake',
                } as unknown as DbtManifest['metadata'],
            },
        );

        const { manifest } = combineManifests(primary, external);

        expect(Object.keys(manifest.metrics).sort()).toEqual([
            'metric.proj.e',
            'metric.proj.p',
        ]);
        expect(Object.keys(manifest.docs).sort()).toEqual([
            'doc.proj.e',
            'doc.proj.p',
        ]);
        expect(manifest.metadata.adapter_type).toBe('postgres');
    });
});

describe('combineManifestSources (N-way fold)', () => {
    test('throws when given no sources', () => {
        expect(() => combineManifestSources([])).toThrow();
    });

    test('N=1 is byte-identical to the single source and preserves key order', () => {
        const only = buildManifest(
            {
                'model.proj.b': modelNode('model.proj.b'),
                'model.proj.a': modelNode('model.proj.a'),
            },
            {
                metrics: {
                    'metric.proj.p': { id: 'p' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.proj.p': { id: 'p' },
                } as unknown as DbtManifest['docs'],
            },
        );

        const { manifest, addedModelIds, collisions } = combineManifestSources([
            source('primary', 0, only),
        ]);

        expect(manifest).toEqual(only);
        // node key order preserved (insertion order, not sorted)
        expect(Object.keys(manifest.nodes)).toEqual([
            'model.proj.b',
            'model.proj.a',
        ]);
        // no spurious optional sections added when the source had none
        expect('sources' in manifest).toBe(false);
        expect('macros' in manifest).toBe(false);
        expect('semantic_models' in manifest).toBe(false);
        expect(addedModelIds).toEqual([]);
        expect(collisions).toEqual([]);
    });

    test('merges disjoint nodes from N sources with no collisions', () => {
        const a = buildManifest({ 'model.a.x': modelNode('model.a.x') });
        const b = buildManifest({ 'model.b.y': modelNode('model.b.y') });
        const c = buildManifest({ 'model.c.z': modelNode('model.c.z') });

        const { manifest, addedModelIds, collisions } = combineManifestSources([
            source('a', 0, a),
            source('b', 1, b),
            source('c', 2, c),
        ]);

        expect(Object.keys(manifest.nodes).sort()).toEqual([
            'model.a.x',
            'model.b.y',
            'model.c.z',
        ]);
        expect(addedModelIds.sort()).toEqual(['model.b.y', 'model.c.z']);
        expect(collisions).toEqual([]);
    });

    test('is order-independent on disjoint keys (deterministic by precedence)', () => {
        const a = buildManifest({ 'model.a.x': modelNode('model.a.x') });
        const b = buildManifest({ 'model.b.y': modelNode('model.b.y') });
        const c = buildManifest({ 'model.c.z': modelNode('model.c.z') });

        const inOrder = combineManifestSources([
            source('a', 0, a),
            source('b', 1, b),
            source('c', 2, c),
        ]).manifest;
        const shuffled = combineManifestSources([
            source('c', 2, c),
            source('a', 0, a),
            source('b', 1, b),
        ]).manifest;

        expect(shuffled).toEqual(inOrder);
    });

    test('lower precedence wins collisions and reports winner/superseded', () => {
        const primary = buildManifest({
            'model.dup': modelNode('model.dup', { tag: 'primary' }),
        });
        const secondary = buildManifest({
            'model.dup': modelNode('model.dup', { tag: 'secondary' }),
            'model.extra': modelNode('model.extra'),
        });

        const { manifest, collisions } = combineManifestSources([
            source('secondary', 1, secondary),
            source('primary', 0, primary),
        ]);

        const dup = manifest.nodes['model.dup'] as unknown as { tag: string };
        expect(dup.tag).toBe('primary');
        expect(collisions).toEqual([
            {
                section: 'nodes',
                key: 'model.dup',
                winningSource: 'primary',
                supersededSource: 'secondary',
            },
        ]);
    });

    test('ties on precedence are broken by name (deterministic winner)', () => {
        const beta = buildManifest({
            'model.dup': modelNode('model.dup', { tag: 'beta' }),
        });
        const alpha = buildManifest({
            'model.dup': modelNode('model.dup', { tag: 'alpha' }),
        });

        const { manifest, collisions } = combineManifestSources([
            source('beta', 0, beta),
            source('alpha', 0, alpha),
        ]);

        const dup = manifest.nodes['model.dup'] as unknown as { tag: string };
        expect(dup.tag).toBe('alpha');
        expect(collisions[0]).toMatchObject({
            winningSource: 'alpha',
            supersededSource: 'beta',
        });
    });

    test('unions metrics, docs, sources, macros and semantic_models across sources', () => {
        const primary = buildManifest(
            { 'model.a': modelNode('model.a') },
            {
                metrics: {
                    'metric.p': { id: 'p' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.p': { id: 'p' },
                } as unknown as DbtManifest['docs'],
                sources: { 'source.p': { id: 'p' } },
                macros: { 'macro.p': { id: 'p' } },
                semantic_models: {
                    'sm.p': { id: 'p' },
                } as unknown as DbtManifest['semantic_models'],
            },
        );
        const secondary = buildManifest(
            { 'model.b': modelNode('model.b') },
            {
                metrics: {
                    'metric.s': { id: 's' },
                } as unknown as DbtManifest['metrics'],
                docs: {
                    'doc.s': { id: 's' },
                } as unknown as DbtManifest['docs'],
                sources: { 'source.s': { id: 's' } },
                macros: { 'macro.s': { id: 's' } },
                semantic_models: {
                    'sm.s': { id: 's' },
                } as unknown as DbtManifest['semantic_models'],
            },
        );

        const { manifest } = combineManifestSources([
            source('primary', 0, primary),
            source('secondary', 1, secondary),
        ]);

        expect(Object.keys(manifest.metrics).sort()).toEqual([
            'metric.p',
            'metric.s',
        ]);
        expect(Object.keys(manifest.docs).sort()).toEqual(['doc.p', 'doc.s']);
        expect(Object.keys(manifest.sources ?? {}).sort()).toEqual([
            'source.p',
            'source.s',
        ]);
        expect(Object.keys(manifest.macros ?? {}).sort()).toEqual([
            'macro.p',
            'macro.s',
        ]);
        expect(Object.keys(manifest.semantic_models ?? {}).sort()).toEqual([
            'sm.p',
            'sm.s',
        ]);
    });

    test('duplicate macros and docs union silently (lowest precedence wins) instead of colliding', () => {
        // dbt namespaces macro/doc unique_ids by package, so two projects on
        // the same adapter always share built-in ids like macro.dbt.* and
        // doc.dbt.__overview__ — these must not surface as collisions.
        const primary = buildManifest(
            { 'model.a': modelNode('model.a') },
            {
                docs: {
                    'doc.dbt.__overview__': { id: 'primary' },
                } as unknown as DbtManifest['docs'],
                macros: { 'macro.dbt.run_query': { id: 'primary' } },
            },
        );
        const secondary = buildManifest(
            { 'model.b': modelNode('model.b') },
            {
                docs: {
                    'doc.dbt.__overview__': { id: 'secondary' },
                } as unknown as DbtManifest['docs'],
                macros: {
                    'macro.dbt.run_query': { id: 'secondary' },
                    'macro.proj.custom': { id: 'secondary' },
                },
            },
        );

        const { manifest, collisions } = combineManifestSources([
            source('primary', 0, primary),
            source('secondary', 1, secondary),
        ]);

        expect(collisions).toEqual([]);
        expect(
            (manifest.docs['doc.dbt.__overview__'] as unknown as { id: string })
                .id,
        ).toBe('primary');
        expect(manifest.macros?.['macro.dbt.run_query']).toEqual({
            id: 'primary',
        });
        expect(manifest.macros?.['macro.proj.custom']).toEqual({
            id: 'secondary',
        });
    });

    test('duplicate metrics, sources and semantic_models still report collisions', () => {
        const primary = buildManifest(
            { 'model.a': modelNode('model.a') },
            {
                metrics: {
                    'metric.dup': { id: 'primary' },
                } as unknown as DbtManifest['metrics'],
                sources: { 'source.dup': { id: 'primary' } },
                semantic_models: {
                    'sm.dup': { id: 'primary' },
                } as unknown as DbtManifest['semantic_models'],
            },
        );
        const secondary = buildManifest(
            { 'model.b': modelNode('model.b') },
            {
                metrics: {
                    'metric.dup': { id: 'secondary' },
                } as unknown as DbtManifest['metrics'],
                sources: { 'source.dup': { id: 'secondary' } },
                semantic_models: {
                    'sm.dup': { id: 'secondary' },
                } as unknown as DbtManifest['semantic_models'],
            },
        );

        const { collisions } = combineManifestSources([
            source('primary', 0, primary),
            source('secondary', 1, secondary),
        ]);

        expect(collisions.map((c) => [c.section, c.key]).sort()).toEqual([
            ['metrics', 'metric.dup'],
            ['semantic_models', 'sm.dup'],
            ['sources', 'source.dup'],
        ]);
        collisions.forEach((c) => {
            expect(c.winningSource).toBe('primary');
            expect(c.supersededSource).toBe('secondary');
        });
    });

    test('non-compiled and non-model non-primary nodes merge but are not added', () => {
        const primary = buildManifest({ 'model.a': modelNode('model.a') });
        const secondary = buildManifest({
            'model.compiled': modelNode('model.compiled', { compiled: true }),
            'model.uncompiled': modelNode('model.uncompiled', {
                compiled: false,
            }),
            'test.t': testNode('test.t'),
        });

        const { manifest, addedModelIds } = combineManifestSources([
            source('primary', 0, primary),
            source('secondary', 1, secondary),
        ]);

        expect(manifest.nodes['model.uncompiled']).toBeDefined();
        expect(manifest.nodes['test.t']).toBeDefined();
        expect(addedModelIds).toEqual(['model.compiled']);
    });
});
