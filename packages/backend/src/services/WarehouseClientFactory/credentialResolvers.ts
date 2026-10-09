import {
    BigqueryAuthenticationType,
    OpenIdIdentityIssuerType,
    WarehouseTypes,
} from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import type { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { UserService } from '../UserService';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';
import { SshTunnelCredentialResolver } from './resolvers/SshTunnelCredentialResolver';

export const createCredentialResolverRegistry = ({
    lightdashConfig,
    userOAuthGrantsModel,
    sshKeyPairModel,
}: {
    lightdashConfig: LightdashConfig;
    sshKeyPairModel: Pick<SshKeyPairModel, 'find'>;
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
    registry.registerTransport(
        SshTunnelCredentialResolver.matches,
        new SshTunnelCredentialResolver(sshKeyPairModel),
    );
    return registry;
};
