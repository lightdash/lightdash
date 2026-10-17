import { type CreateWarehouseCredentials } from '@lightdash/common';
import * as yaml from 'js-yaml';
import path from 'path';
import { toDbtTarget } from './index';
import { legacyProfiles } from './legacyProfiles.mock';
import { targetCases } from './targets.mock';

const caBundleDir = path.dirname(
    require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-rds-global.pem'),
);

describe('explicit dbt credential policy', () => {
    it.each([false, true])(
        'preserves the unsupported warehouse error with explicit credentials %s',
        (explicitCredentials) => {
            expect(() =>
                toDbtTarget(
                    {
                        type: 'unsupported',
                    } as unknown as CreateWarehouseCredentials,
                    { explicitCredentials },
                ),
            ).toThrowError(
                new Error(
                    'No profile implemented for warehouse type: unsupported',
                ),
            );
        },
    );

    it.each(targetCases.filter(({ ambientMode }) => ambientMode !== null))(
        'flag on rejects $name with a mode and an alternative',
        ({ credentials, ambientMode }) => {
            const result = toDbtTarget(credentials, {
                explicitCredentials: true,
            });
            expect(result).toEqual({
                kind: 'none',
                reason: expect.any(String),
            });
            if (result.kind !== 'none')
                throw new Error('Expected an unsupported dbt target');
            expect(result.reason.toLowerCase()).toContain(
                ambientMode!.toLowerCase(),
            );
            expect(result.reason).toMatch(/server.*identity/i);
            expect(result.reason).toMatch(/use .*(key|sign-in)/i);
        },
    );

    it.each(targetCases.filter(({ ambientMode }) => ambientMode === null))(
        'flag on preserves $name target and environment',
        ({ credentials, target, environment }) => {
            const off = toDbtTarget(credentials, {
                explicitCredentials: false,
            });
            const on = toDbtTarget(credentials, { explicitCredentials: true });
            expect(on).toEqual({ kind: 'target', target, environment });
            expect(on).toEqual(off);
        },
    );

    it.each(targetCases)(
        'flag off preserves $name legacy YAML bytes and environment',
        ({ name, credentials, environment }) => {
            const result = toDbtTarget(credentials, {
                explicitCredentials: false,
            });
            expect(result.kind).toBe('target');
            if (result.kind !== 'target')
                throw new Error('Expected a compatible dbt target');
            expect(
                yaml.dump({
                    lightdash_profile: {
                        target: 'prod',
                        outputs: { prod: result.target },
                    },
                }),
            ).toBe(
                legacyProfiles[name].replace(
                    /sslrootcert: >-\n {8}<CA_BUNDLE_DIR>\/([^\n]+)\n/g,
                    (_, filename: string) =>
                        `sslrootcert: ${yaml.dump(
                            path.join(caBundleDir, filename),
                            { indent: 8 },
                        )}`,
                ),
            );
            expect(result.environment).toEqual(environment);
        },
    );
});
