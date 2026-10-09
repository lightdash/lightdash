import {
    BigqueryAuthenticationType,
    OpenIdIdentityIssuerType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import type { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { UserService } from '../UserService';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';
import type { SnowflakeOAuthCredentialResolver } from './resolvers/SnowflakeOAuthCredentialResolver';
import { SshTunnelCredentialResolver } from './resolvers/SshTunnelCredentialResolver';

export const createCredentialResolverRegistry = ({
    lightdashConfig,
    userOAuthGrantsModel,
    sshKeyPairModel,
    snowflakeOAuthCredentialResolver,
}: {
    lightdashConfig: LightdashConfig;
    sshKeyPairModel: Pick<SshKeyPairModel, 'find'>;
    snowflakeOAuthCredentialResolver: SnowflakeOAuthCredentialResolver;
    userOAuthGrantsModel: Pick<UserOAuthGrantsModel, 'getRefreshToken'>;
}): CredentialResolverRegistry => {
    const registry = new CredentialResolverRegistry();
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        new BigquerySsoCredentialResolver(() => lightdashConfig.auth.google, {
            getRefreshToken: (userUuid) =>
                userOAuthGrantsModel.getRefreshToken(
                    userUuid,
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            validateRefreshToken: (token) =>
                UserService.generateGoogleAccessToken(token, 'bigquery'),
        }),
    );
    registry.register(
        WarehouseTypes.SNOWFLAKE,
        SnowflakeAuthenticationType.SSO,
        snowflakeOAuthCredentialResolver,
    );
    registry.registerTransport(
        SshTunnelCredentialResolver.matches,
        new SshTunnelCredentialResolver(sshKeyPairModel),
    );
    return registry;
};
