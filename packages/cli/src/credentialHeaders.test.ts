import {
    AuthTokenPrefix,
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import {
    agentCommandUnavailable,
    resetCredentialContext,
    setAgentConnectionSelection,
} from './credentials';
import { CLI_VERSION } from './env';
import { buildRequestHeaders, getAuthHeader } from './handlers/utils';

afterEach(() => {
    resetCredentialContext();
    vi.unstubAllEnvs();
});
it.each([getAuthHeader, buildRequestHeaders])(
    'refuses a direct legacy header helper with a selection',
    (helper) => {
        setAgentConnectionSelection('selected');
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
