import { type Explore } from '@lightdash/common';
import { type Knex } from 'knex';
import { MultiConnectionCompiler } from '../../../services/MultiConnectionCompiler/MultiConnectionCompiler';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { refreshFixture, refreshOperation } from './preAggregateRefresh.mock';

export const writeOperations = [
    'array',
    'stream',
    'multi',
    'parameters',
    'virtual-create',
    'virtual-update',
] as const;

export const transactionFixture = async (
    database: Knex,
    operation: string,
    incoming: Explore[] = [{ ...validExplore, name: 'connection_write' }],
) => {
    const f = await refreshFixture(database);
    Object.assign(f.service, {
        multiConnectionCompiler: Object.assign(
            Object.create(MultiConnectionCompiler.prototype),
            { projectModel: f.projects },
        ),
    });
    const op = await refreshOperation(
        f,
        operation === 'multi' ? 'retained' : operation,
        incoming,
    );
    await f.projects.saveExploresToCache(
        f.projectUuid,
        [{ ...validExplore, name: 'stored' }],
        false,
    );
    return { ...f, ...op };
};

export const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

export const writeBoundary = (
    f: Awaited<ReturnType<typeof transactionFixture>>,
    operation: string,
) => {
    const methods: Record<string, string> = {
        array: 'saveExploresToCache',
        stream: 'saveExploreStreamToCache',
        multi: 'saveMultiConnectionExplores',
        parameters: 'replace',
        'virtual-create': 'createVirtualView',
        'virtual-update': 'updateVirtualView',
    };
    const target = (operation === 'parameters'
        ? f.parameters
        : f.projects) as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
    >;
    const method = methods[operation];
    return {
        original: target[method].bind(target),
        spy: vi.spyOn(target, method),
    };
};
