import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SnowflakeAgentClientResolver } from './SnowflakeAgentClientResolver';

const setup = () => {
    const config = {
        ...lightdashConfigMock,
        license: { ...lightdashConfigMock.license, licenseKey: 'test-license' },
        auth: {
            ...lightdashConfigMock.auth,
            snowflakeAi: {
                ...lightdashConfigMock.auth.snowflakeAi,
                account: undefined,
                clientId: 'environment-client',
                clientSecret: 'environment-secret',
                authorizationEndpoint:
                    'https://env.snowflakecomputing.com/oauth/authorize',
                tokenEndpoint:
                    'https://env.snowflakecomputing.com/oauth/token-request',
            },
        },
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

test('an organization client wins as a whole over environment settings', async () => {
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

test('uses complete environment settings when no client is saved', async () => {
    const { resolver } = setup();
    expect(await resolver.resolve('org')).toMatchObject({
        source: 'environment',
        organizationUuid: 'org',
        clientVersion: null,
        clientId: 'environment-client',
        clientSecret: 'environment-secret',
        account: 'env',
        accessUrl: 'https://env.snowflakecomputing.com',
    });
});

test('returns null for incomplete environment settings', async () => {
    const { resolver, config } = setup();
    config.auth.snowflakeAi.clientSecret = '';
    expect(await resolver.resolve('org')).toBeNull();
    expect(await resolver.getMissingSettings('org')).toEqual([
        'SNOWFLAKE_AI_OAUTH_CLIENT_SECRET',
    ]);
    expect(await resolver.isConfigured('org')).toBe(false);
});

test('does not fall back to environment settings if decryption fails', async () => {
    const { resolver, model } = setup();
    model.getWithSecret.mockRejectedValue(new Error('Cannot decrypt'));
    await expect(resolver.resolve('org')).rejects.toThrow('Cannot decrypt');
    await expect(resolver.isConfigured('org')).rejects.toThrow(
        'Cannot decrypt',
    );
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
    Object.assign(config.license, { licenseKey: undefined });
    expect(await resolver.resolve('org')).not.toBeNull();
    expect(await resolver.getMissingSettings('org')).toEqual([
        'Enterprise licence',
    ]);
    expect(await resolver.isConfigured('org')).toBe(false);
});
