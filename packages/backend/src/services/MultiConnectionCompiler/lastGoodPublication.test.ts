import { type Explore, type ExploreError } from '@lightdash/common';
import {
    MultiConnectionCompiler,
    type MultiConnectionSave,
} from './MultiConnectionCompiler';

it.each([false, true])(
    'withholds all confirmation only for an unattributed explore error: %s',
    async (hasErrors) => {
        const saveMultiConnectionExplores = vi.fn(
            async (_projectUuid, stream) => {
                for await (const entry of stream)
                    expect(entry.explore.name).toBe('orders');
                return { cachedExploreUuids: [] };
            },
        );
        const compiler = Object.assign(
            Object.create(MultiConnectionCompiler.prototype),
            {
                projectModel: { saveMultiConnectionExplores },
            },
        ) as MultiConnectionCompiler;
        const persistArtifacts = vi.fn(async () => undefined);
        const compilation: MultiConnectionSave = {
            exploreStream: (async function* publishedExplores() {
                yield {
                    name: 'orders',
                    ...(hasErrors
                        ? { errors: [{ message: 'compile failed' }] }
                        : {}),
                } as Explore | ExploreError;
            })(),
            bindingOf: () => null,
            carry: { kind: 'connections', warehouseConnectionUuids: [] },
            persistArtifacts,
        };
        await compiler.save('project', compilation);
        expect(persistArtifacts).toHaveBeenCalledExactlyOnceWith({
            exploresCommitted: true,
            ...(hasErrors ? { successfulCompile: false } : {}),
        });
    },
);

it.each(['identity', 'table', 'stamp'] as const)(
    'passes only the failed provider to confirmation using its %s',
    async (identityKind) => {
        const saveMultiConnectionExplores = vi.fn(
            async (_projectUuid, stream) => {
                for await (const entry of stream)
                    expect(['healthy', 'failed']).toContain(entry.explore.name);
                return { cachedExploreUuids: [] };
            },
        );
        const compiler = Object.assign(
            Object.create(MultiConnectionCompiler.prototype),
            { projectModel: { saveMultiConnectionExplores } },
        ) as MultiConnectionCompiler;
        const persistArtifacts = vi.fn(async () => undefined);
        const failedExplore = {
            name: 'failed',
            errors: [{ message: 'Invalid model metadata' }],
            ...{
                identity: { dbtModelIdentity: { sourceUuid: 'failed-source' } },
                table: {
                    tables: { failed: { dbtSourceUuid: 'failed-source' } },
                },
                stamp: { dbtSourceUuid: 'failed-source' },
            }[identityKind],
        } as ExploreError;
        const compilation: MultiConnectionSave = {
            exploreStream: (async function* publishedExplores() {
                yield { name: 'healthy' } as Explore;
                yield failedExplore;
                yield failedExplore;
            })(),
            bindingOf: () => null,
            carry: { kind: 'connections', warehouseConnectionUuids: [] },
            persistArtifacts,
        };

        await compiler.save('project', compilation);

        expect(persistArtifacts).toHaveBeenCalledExactlyOnceWith({
            exploresCommitted: true,
            failedSourceUuids: ['failed-source'],
        });
    },
);
