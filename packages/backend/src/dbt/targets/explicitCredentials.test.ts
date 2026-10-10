import * as yaml from 'js-yaml';
import { profileFromCredentials } from '../profiles';
import { toDbtTarget } from './index';
import { targetCases } from './targets.mock';

describe('explicit dbt credential policy', () => {
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
        ({ credentials }) => {
            const legacy = profileFromCredentials(credentials, '/tmp/profiles');
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
            ).toBe(legacy.profile);
            expect(result.environment).toEqual(legacy.environment);
        },
    );
});
