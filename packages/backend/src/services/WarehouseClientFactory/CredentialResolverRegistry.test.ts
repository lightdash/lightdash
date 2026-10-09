import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { expectTypeOf } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from './ConnectionContext';
import {
    type CredentialResolver,
    type CredentialSelection,
} from './CredentialResolver';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';

it('rejects duplicate registrations', () => {
    const registry = new CredentialResolverRegistry();
    const resolver = new BigquerySsoCredentialResolver(
        () => lightdashConfigMock.auth.google,
        null,
    );
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        resolver,
    );
    expect(() =>
        registry.register(
            WarehouseTypes.BIGQUERY,
            BigqueryAuthenticationType.SSO,
            resolver,
        ),
    ).toThrow('already registered');
    expectTypeOf<CredentialResolver<CreateBigqueryCredentials>>().not.toExtend<
        CredentialResolver<CreateSnowflakeCredentials>
    >();
});

it.each([
    undefined,
    BigqueryAuthenticationType.PRIVATE_KEY,
    BigqueryAuthenticationType.ADC,
])('keeps %s outside the SSO resolver', async (authenticationType) => {
    const registry = new CredentialResolverRegistry();
    const resolver = new BigquerySsoCredentialResolver(
        () => lightdashConfigMock.auth.google,
        null,
    );
    const resolve = vi.spyOn(resolver, 'resolve');
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        resolver,
    );
    const credentials: CreateBigqueryCredentials = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType,
        project: 'analytics',
        dataset: 'prod',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'cli-id',
            client_secret: 'cli-secret',
            refresh_token: 'cli-refresh',
        },
    };
    const selection: CredentialSelection<CreateBigqueryCredentials> = {
        connection: credentials,
        stored: credentials,
        owner: null,
        context: connectionContextFromUser(
            { userUuid: 'user' },
            { organizationUuid: 'org', queryContext: null },
        ),
        projectUuid: null,
        warehouseConnectionUuid: null,
        credentialKind: WarehouseCredentialKind.SHARED,
        aiPlan: null,
    };
    const legacy = vi.fn(async () => credentials);
    expect(await registry.resolveCredentialSelection(selection, legacy)).toBe(
        credentials,
    );
    expect(legacy).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
});
