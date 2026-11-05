import { FeatureFlags } from '@lightdash/common';
import {
    canonicalOAuthResource,
    requestedOAuthResource,
} from './oauthResources';
import { resolveOAuthSecurityStrict } from './security';

const site = 'https://server.example/base/';
const api = 'https://server.example/base';
const mcp = `${api}/api/v1/mcp`;

it.each([api, `${api}/`])('canonicalises API resource %s', (raw) => {
    expect(canonicalOAuthResource(site, raw)).toBe(api);
});
it.each([
    mcp,
    `${mcp}/`,
    `${mcp}/projects/11111111-1111-4111-8111-111111111111`,
    `${mcp}/projects/11111111-1111-4111-8111-111111111111/`,
])('canonicalises MCP resource %s', (raw) => {
    expect(canonicalOAuthResource(site, raw)).toBe(mcp);
});
it.each([
    'https://foreign.example/base',
    `${api}/other`,
    `${api}?q=1`,
    `${api}#f`,
    `${api}?`,
    `${api}#`,
    'https://user@server.example/base',
    `${mcp}/other`,
    `${mcp}/projects/not-a-uuid`,
    `${mcp}/projects/11111111-1111-4111-8111-111111111111/other`,
])('rejects resource %s', (raw) => {
    expect(canonicalOAuthResource(site, raw)).toBeNull();
});
it.each([['one', 'two'], '', null, {}])(
    'rejects malformed resource %j',
    (resource) => {
        expect(() =>
            requestedOAuthResource(site, { body: { resource }, query: {} }),
        ).toThrow(
            expect.objectContaining({ name: 'invalid_target', status: 400 }),
        );
    },
);
it('rejects duplicate resource values across body and query', () => {
    expect(() =>
        requestedOAuthResource(site, {
            body: { resource: api },
            query: { resource: api },
        }),
    ).toThrow(expect.objectContaining({ name: 'invalid_target' }));
});
it('reads only AgentIdentity and passes undefined for anonymous evaluation', async () => {
    const flags = { get: vi.fn().mockResolvedValue({ enabled: true }) };
    await expect(resolveOAuthSecurityStrict(flags, null)).resolves.toBe(true);
    expect(flags.get).toHaveBeenCalledExactlyOnceWith({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: undefined,
    });
});
it('uses the authenticated user for strict evaluation', async () => {
    const flags = { get: vi.fn().mockResolvedValue({ enabled: false }) };
    const user = { userUuid: 'user', organizationUuid: 'org' };
    await expect(resolveOAuthSecurityStrict(flags, user)).resolves.toBe(false);
    expect(flags.get).toHaveBeenCalledExactlyOnceWith({
        featureFlagId: FeatureFlags.AgentIdentity,
        user,
    });
});

it('removes all configured trailing slashes from the canonical API resource', () => {
    expect(canonicalOAuthResource(`${api}///`, api)).toBe(api);
});
