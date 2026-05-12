import { DbtManifest, DbtNode } from '@lightdash/common';
import { combineManifests } from './manifest';

const modelNode = (uniqueId: string, extra: Record<string, unknown> = {}) =>
    ({
        unique_id: uniqueId,
        resource_type: 'model',
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

describe('combineManifests', () => {
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

    test('metrics, docs, and metadata come from primary only', () => {
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

        expect(Object.keys(manifest.metrics)).toEqual(['metric.proj.p']);
        expect(Object.keys(manifest.docs)).toEqual(['doc.proj.p']);
        expect(manifest.metadata.adapter_type).toBe('postgres');
    });
});
