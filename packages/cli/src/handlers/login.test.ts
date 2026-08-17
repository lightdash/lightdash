import { isApiKeyEnvVarShadowing } from './login';

describe('isApiKeyEnvVarShadowing', () => {
    it('is false when LIGHTDASH_API_KEY is not set', () => {
        expect(isApiKeyEnvVarShadowing(undefined, {})).toBe(false);
        expect(isApiKeyEnvVarShadowing('ldpat_from_login', {})).toBe(false);
    });

    it('is true when an interactive login saves a token the env var will shadow', () => {
        expect(
            isApiKeyEnvVarShadowing(undefined, {
                LIGHTDASH_API_KEY: 'ldpat_stale_env',
            }),
        ).toBe(true);
    });

    it('is false for `lightdash login --token $LIGHTDASH_API_KEY`', () => {
        expect(
            isApiKeyEnvVarShadowing('ldpat_ci', {
                LIGHTDASH_API_KEY: 'ldpat_ci',
            }),
        ).toBe(false);
    });

    it('is true when --token is a different token to the env var', () => {
        expect(
            isApiKeyEnvVarShadowing('ldpat_explicit', {
                LIGHTDASH_API_KEY: 'ldpat_stale_env',
            }),
        ).toBe(true);
    });
});
