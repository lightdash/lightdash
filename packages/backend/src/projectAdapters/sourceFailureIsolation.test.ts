import { DbtError } from '@lightdash/common';
import { DbtSourceError } from '../dbt/DbtSourceError';
import Logger from '../logging/logger';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { CompileInterruptedError } from '../scheduler/compileShutdown';
import { DbtSourceDiskError } from './DbtSourceDiskPool';
import {
    SourceFailureIsolation,
    validateDbtSourceManifest,
} from './sourceFailureIsolation';

const setup = (count: number) => {
    const countCachedExploresForDbtSource = vi.fn(async () => count);
    const onWarning = vi.fn(async (_warning: string) => undefined);
    const isolation = new SourceFailureIsolation(
        { countCachedExploresForDbtSource } as unknown as ProjectModel,
        'project',
        'primary',
        onWarning,
    );
    return { isolation, onWarning, countCachedExploresForDbtSource };
};

afterEach(() => vi.restoreAllMocks());

it('reports the carried count without exposing command errors or dbt logs', async () => {
    const { isolation, onWarning } = setup(3);
    const log = vi.spyOn(Logger, 'warn');
    const secrets = [
        'synthetic-token',
        'https://user:synthetic-password@invalid/repository',
        '/private/synthetic-key',
    ];
    const error = new DbtSourceError(
        secrets.join(' '),
        new DbtError(secrets.join(' ')),
    );
    expect(
        await isolation.skip('broken', 'Broken source', error, 'prepare'),
    ).toBe(true);
    expect(isolation.failedSourceUuids).toEqual(['broken']);
    expect(isolation.warnings).toEqual([
        expect.stringContaining(
            'kept its 3 explores from the last successful refresh',
        ),
    ]);
    expect(onWarning).toHaveBeenCalledWith(isolation.warnings[0]);
    expect(log).toHaveBeenCalledWith('dbt.compile.sourceSkipped', {
        event: 'dbt.compile.sourceSkipped',
        projectUuid: 'project',
        sourceUuid: 'broken',
        reasonClass: 'prepare',
        carriedExploreCount: 3,
    });
    for (const secret of secrets) {
        expect(
            JSON.stringify([isolation.warnings, log.mock.calls]),
        ).not.toContain(secret);
    }
});

it('reports that a source with no last-good explores carries nothing', async () => {
    const { isolation } = setup(0);
    await isolation.skip(
        'new',
        'New source',
        new Error('parse error'),
        'manifest',
    );
    expect(isolation.warnings).toEqual([
        expect.stringContaining('nothing was carried'),
    ]);
});

it('leaves primary failures fatal', async () => {
    const { isolation, countCachedExploresForDbtSource } = setup(3);
    expect(
        await isolation.skip(
            'primary',
            'Primary',
            new Error('failed'),
            'manifest',
        ),
    ).toBe(false);
    expect(countCachedExploresForDbtSource).not.toHaveBeenCalled();
});

it.each([
    new CompileInterruptedError(),
    new DbtSourceDiskError(),
    new DOMException('cancelled', 'AbortError'),
    new DOMException('timed out', 'TimeoutError'),
    new DbtError('Found a cycle: model.a -> model.b'),
    new DbtError('The ref is ambiguous'),
])('keeps interruption and graph errors fatal: %s', async (error) => {
    const { isolation, countCachedExploresForDbtSource } = setup(3);
    expect(
        await isolation.skip(
            'broken',
            'Broken',
            new DbtSourceError('wrapped', error),
            'manifest',
        ),
    ).toBe(false);
    expect(countCachedExploresForDbtSource).not.toHaveBeenCalled();
});

it('emits one warning when preflight and resolution see the same failure', async () => {
    const { isolation, onWarning } = setup(3);
    await isolation.skip('broken', 'Broken', new Error('failed'), 'prepare');
    await isolation.skip('broken', 'Broken', new Error('failed'), 'prepare');
    expect(onWarning).toHaveBeenCalledOnce();
});

it('rejects unsupported manifest adapters at the source boundary', () => {
    expect(() =>
        validateDbtSourceManifest({
            nodes: {},
            metrics: {},
            docs: {},
            metadata: {
                adapter_type: 'unsupported',
                generated_at: '',
                dbt_schema_version: '/v12.json',
            },
        }),
    ).toThrow('unsupported adapter');
});

it('keeps the original source error out of serialized error fields', () => {
    const cause = new Error('synthetic-token');
    const error = new DbtSourceError('Source failed', cause);
    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).not.toContain('cause');
    expect(JSON.stringify(error)).not.toContain('synthetic-token');
});
