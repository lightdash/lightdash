import {
    AuthTokenPrefix,
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import { agentCommandUnavailable } from './credentials';
import { CLI_VERSION } from './env';
import {
    buildCredentialHeaders,
    buildRequestHeaders,
    getAuthHeader,
} from './handlers/utils';
import { loginFixture } from './personalLogin/fixtures';

afterEach(() => {
    vi.unstubAllEnvs();
});
it.each([getAuthHeader, buildRequestHeaders])(
    'refuses a direct legacy header helper with a selection',
    (helper) => {
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'selected');
        expect(() => helper('human-secret')).toThrow(agentCommandUnavailable);
    },
);
it.each([
    ['ldpat_person', 'ApiKey'],
    ['legacy', 'ApiKey'],
    [`${AuthTokenPrefix.SERVICE_ACCOUNT}service`, 'Bearer'],
])('keeps ordinary headers for %s', (token, scheme) => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', 'proxy');
    vi.stubEnv('CI', 'true');
    expect(buildRequestHeaders(token)).toEqual({
        'Content-Type': 'application/json',
        Authorization: `${scheme} ${token}`,
        'Proxy-Authorization': 'proxy',
        [LightdashRequestMethodHeader]: RequestMethod.CLI_CI,
        [LightdashCliVersionHeader]: CLI_VERSION,
    });
});

it('uses Bearer for a personal OAuth credential with the existing CLI headers', () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', undefined);
    vi.stubEnv('CI', 'false');
    const login = loginFixture();
    expect(
        buildCredentialHeaders(
            { kind: 'personal_oauth', token: login.tokens.accessToken, login },
            null,
        ),
    ).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer personal-access',
        [LightdashRequestMethodHeader]: RequestMethod.CLI,
        [LightdashCliVersionHeader]: CLI_VERSION,
    });
});
