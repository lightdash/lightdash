import { ParameterError } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { parseConfig } from '../../config/parseConfig';
import { SnowflakeAgentClientResolver } from './SnowflakeAgentClientResolver';

const setup = () => {
    const config = {
        ...lightdashConfigMock,
        license: { ...lightdashConfigMock.license, licenseKey: 'test-license' },
    };
    const saved = {
        organizationUuid: 'org',
        accountUrl: 'https://org.snowflakecomputing.com',
        accountIdentifier: 'org',
        clientId: 'org-client',
        clientSecret: 'org-secret',
        clientVersion: 'version-1',
        updatedAt: new Date(),
    };
    const model = {
        getWithSecret: vi
            .fn<() => Promise<typeof saved | null>>()
            .mockResolvedValue(null),
    };
    const createResolver = () =>
        new SnowflakeAgentClientResolver({
            lightdashConfig: config,
            organizationSnowflakeAgentClientModel: model,
        });
    return { config, model, saved, createResolver, resolver: createResolver() };
};

test('resolves the saved organization client', async () => {
    const { saved, model, resolver } = setup();
    model.getWithSecret.mockResolvedValue(saved);
    expect(await resolver.resolve('org')).toEqual({
        source: 'organization',
        organizationUuid: 'org',
        clientVersion: 'version-1',
        clientId: 'org-client',
        clientSecret: 'org-secret',
        account: 'org',
        authorizationEndpoint: `${saved.accountUrl}/oauth/authorize`,
        tokenEndpoint: `${saved.accountUrl}/oauth/token-request`,
        accessUrl: saved.accountUrl,
    });
    expect(model.getWithSecret).toHaveBeenCalledWith('org');
});

afterEach(() => vi.unstubAllEnvs());

test('ignores legacy environment settings when no client is saved', async () => {
    vi.stubEnv('LIGHTDASH_SECRET', 'test-secret');
    vi.stubEnv('S3_ENDPOINT', 'mock_endpoint');
    vi.stubEnv('S3_BUCKET', 'mock_bucket');
    vi.stubEnv('S3_REGION', 'mock_region');
    vi.stubEnv('SNOWFLAKE_AI_OAUTH_ACCOUNT', 'legacy-account');
    vi.stubEnv('SNOWFLAKE_AI_OAUTH_CLIENT_ID', 'legacy-client');
    vi.stubEnv('SNOWFLAKE_AI_OAUTH_CLIENT_SECRET', 'legacy-secret');
    vi.stubEnv(
        'SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT',
        'https://legacy.snowflakecomputing.com/oauth/authorize',
    );
    vi.stubEnv(
        'SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT',
        'https://legacy.snowflakecomputing.com/oauth/token-request',
    );
    const { config, createResolver } = setup();
    config.auth = parseConfig().auth;
    const resolver = createResolver();
    expect(await resolver.resolve('org')).toBeNull();
    expect(await resolver.getMissingSettings('org')).toEqual([
        'Snowflake OAuth client',
    ]);
    expect(await resolver.isConfigured('org')).toBe(false);
    Object.assign(config.license, { licenseKey: null });
    expect(await resolver.getMissingSettings('org')).toEqual([
        'Snowflake OAuth client',
        'Enterprise licence',
    ]);
});

test('reports an unreadable saved client secret', async () => {
    const { resolver, model, config } = setup();
    model.getWithSecret.mockRejectedValue(new ParameterError('Cannot decrypt'));
    await expect(resolver.resolve('org')).rejects.toThrow('Cannot decrypt');
    await expect(resolver.isConfigured('org')).resolves.toBe(false);
    await expect(resolver.getMissingSettings('org')).resolves.toEqual([
        'Snowflake client secret (replace it)',
    ]);
    Object.assign(config.license, { licenseKey: null });
    await expect(resolver.getMissingSettings('org')).resolves.toEqual([
        'Snowflake client secret (replace it)',
        'Enterprise licence',
    ]);
});

test('independent resolvers both see a replacement without caching', async () => {
    const { saved, model, resolver, createResolver } = setup();
    const second = createResolver();
    model.getWithSecret.mockResolvedValue(saved);
    await expect(resolver.resolve('org')).resolves.toMatchObject({
        clientVersion: 'version-1',
    });
    await expect(second.resolve('org')).resolves.toMatchObject({
        clientVersion: 'version-1',
    });
    model.getWithSecret.mockResolvedValue({
        ...saved,
        clientId: 'replacement',
        clientVersion: 'version-2',
    });
    await expect(resolver.resolve('org')).resolves.toMatchObject({
        clientId: 'replacement',
        clientVersion: 'version-2',
    });
    await expect(second.resolve('org')).resolves.toMatchObject({
        clientId: 'replacement',
        clientVersion: 'version-2',
    });
});

test('a saved client still requires an Enterprise licence', async () => {
    const { resolver, model, saved, config } = setup();
    model.getWithSecret.mockResolvedValue(saved);
    Object.assign(config.license, { licenseKey: null });
    expect(await resolver.resolve('org')).not.toBeNull();
    expect(await resolver.getMissingSettings('org')).toEqual([
        'Enterprise licence',
    ]);
    expect(await resolver.isConfigured('org')).toBe(false);
});
