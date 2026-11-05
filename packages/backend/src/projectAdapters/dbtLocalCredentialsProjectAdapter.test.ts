import { SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import fs from 'fs';
import * as fspromises from 'fs/promises';
import path from 'path';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { toDbtTarget } from '../dbt/targets';
import { bigqueryWif, bigqueryWifFile } from '../dbt/targets/targets.mock';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

vi.mock('execa', () => ({
    default: vi.fn(async () => ({ all: '', stdout: '' })),
}));

const buildAdapter = (
    explicitCredentials: boolean,
    dbtTarget = toDbtTarget(bigqueryWif, { explicitCredentials }),
) =>
    new DbtLocalCredentialsProjectAdapter({
        warehouseClient: warehouseClientMock,
        projectDir: '/tmp',
        dbtTarget,
        explicitCredentials,
        targetName: undefined,
        environment: [
            { key: 'GOOGLE_APPLICATION_CREDENTIALS', value: '/untrusted.json' },
        ],
        environmentVariableAllowlist: ['GOOGLE_APPLICATION_CREDENTIALS'],
        cachedWarehouse: {
            warehouseCatalog: undefined,
            onWarehouseCatalogChange: vi.fn(),
        },
        dbtVersion: SupportedDbtVersions.V1_10,
        partialParseBaselinePath: null,
    });

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

it.each([false, true])(
    'scopes the credential to dbt and removes it with explicitCredentials=%s',
    async (explicitCredentials) => {
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/host-storage.json');
        const adapter = buildAdapter(explicitCredentials);
        const credentialPath = path.join(
            adapter.profilesDir,
            'bigquery-workload-identity.json',
        );
        try {
            expect(await fspromises.readdir(adapter.profilesDir)).toEqual([
                'bigquery-workload-identity.json',
                'profiles.yml',
            ]);
            expect(await fspromises.readFile(credentialPath, 'utf8')).toBe(
                bigqueryWifFile().content,
            );
            expect((await fspromises.stat(credentialPath)).mode % 0o1000).toBe(
                0o600,
            );
            const client = adapter.dbtClient;
            if (!(client instanceof DbtCliClient))
                throw new Error('Expected a dbt CLI client');
            await client.installDeps();
            expect(execa).toHaveBeenCalledWith(
                client.getDbtExec(),
                expect.arrayContaining([
                    'deps',
                    '--profiles-dir',
                    adapter.profilesDir,
                ]),
                expect.objectContaining({
                    extendEnv: false,
                    env: expect.objectContaining({
                        GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
                    }),
                }),
            );
            expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
                '/host-storage.json',
            );
        } finally {
            await adapter.destroy();
        }
        await expect(
            fspromises.stat(adapter.profilesDir),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
            '/host-storage.json',
        );
    },
);

it('removes the profile and credential even when dbt cleanup fails', async () => {
    const adapter = buildAdapter(true);
    vi.spyOn(adapter.dbtClient, 'cleanup').mockRejectedValueOnce(
        new Error('cleanup failed'),
    );
    try {
        await expect(adapter.destroy()).rejects.toThrow('cleanup failed');
        await expect(
            fspromises.stat(adapter.profilesDir),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
        await adapter.destroy();
    }
});

it('removes the profile directory if writing the credential fails', () => {
    const mkdtemp = vi.spyOn(fs, 'mkdtempSync');
    const writeFile = fs.writeFileSync;
    const writes = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementationOnce(writeFile)
        .mockImplementationOnce(() => {
            throw new Error('write failed');
        });
    expect(() => buildAdapter(true)).toThrow('write failed');
    const created = mkdtemp.mock.results[0];
    if (created?.type !== 'return' || typeof created.value !== 'string')
        throw new Error('Expected a profile directory');
    expect(writes).toHaveBeenNthCalledWith(
        1,
        path.join(created.value, 'profiles.yml'),
        expect.any(String),
    );
    expect(writes).toHaveBeenNthCalledWith(
        2,
        path.join(created.value, 'bigquery-workload-identity.json'),
        bigqueryWifFile().content,
        { mode: 0o600 },
    );
    expect(fs.existsSync(created.value)).toBe(false);
});

it('removes the profile directory if serializing the profile fails', () => {
    const mkdtemp = vi.spyOn(fs, 'mkdtempSync');
    const writeFile = vi.spyOn(fs, 'writeFileSync');
    expect(() =>
        buildAdapter(true, {
            kind: 'target',
            target: { unsupported: Symbol('unserializable') },
            environment: {},
        }),
    ).toThrow('unacceptable kind of an object to dump');
    const created = mkdtemp.mock.results[0];
    if (created?.type !== 'return')
        throw new Error('Expected a profile directory');
    expect(writeFile).not.toHaveBeenCalled();
    expect(fs.existsSync(created.value)).toBe(false);
});
