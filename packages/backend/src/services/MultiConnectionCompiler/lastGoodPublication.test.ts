import { type Explore, type ExploreError } from '@lightdash/common';
import {
    MultiConnectionCompiler,
    type MultiConnectionSave,
} from './MultiConnectionCompiler';

it.each([false, true])(
    'marks successful source publication false only when an explore has errors: %s',
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
