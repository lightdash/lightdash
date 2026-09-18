import { MobileSetupCodeError } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type OAuth2Model } from '../../models/OAuth2Model';
import { MobileSetupRejection } from '../MobileSetupService/MobileSetupRejection';
import type { MobileSetupService } from '../MobileSetupService/MobileSetupService';

export const createMobileSetupCodeGrantType = (
    getMobileSetupService: () => MobileSetupService,
) =>
    class MobileSetupCodeGrantType extends OAuth2Server.AbstractGrantType {
        declare protected readonly model: OAuth2Model;

        async handle(
            request: OAuth2Server.Request,
            client: OAuth2Server.Client,
        ): Promise<OAuth2Server.Token> {
            let requestedScope: string[] | undefined;
            try {
                requestedScope = this.getScope(request);
            } catch {
                throw new OAuth2Server.InvalidScopeError(
                    'Request at least one of read or write',
                );
            }
            const scope =
                requestedScope === undefined || requestedScope.length === 0
                    ? ['read', 'write']
                    : ['read', 'write'].filter((allowed) =>
                          requestedScope.includes(allowed),
                      );
            if (scope.length === 0)
                throw new OAuth2Server.InvalidScopeError(
                    'Request at least one of read or write',
                );
            try {
                return await getMobileSetupService().redeem(
                    {
                        code: request.body.code,
                        client,
                        platform: request.body.platform,
                    },
                    async ({ user, projectUuid }, transaction) => {
                        const accessToken = await this.generateAccessToken(
                            client,
                            user,
                            scope,
                        );
                        const refreshToken = await this.generateRefreshToken(
                            client,
                            user,
                            scope,
                        );
                        const accessTokenExpiresAt =
                            await this.getAccessTokenExpiresAt();
                        const refreshTokenExpiresAt =
                            await this.getRefreshTokenExpiresAt();
                        const saved = await this.model.saveToken(
                            {
                                accessToken,
                                refreshToken,
                                accessTokenExpiresAt,
                                refreshTokenExpiresAt,
                                scope,
                                client,
                                user,
                                lightdash_project_uuid: projectUuid,
                            },
                            client,
                            user,
                            { trx: transaction },
                        );
                        if (!saved)
                            throw new OAuth2Server.InvalidGrantError(
                                MobileSetupCodeError.UNKNOWN,
                            );
                        return saved;
                    },
                );
            } catch (error) {
                throw new OAuth2Server.InvalidGrantError(
                    error instanceof MobileSetupRejection
                        ? error.code
                        : MobileSetupCodeError.UNKNOWN,
                );
            }
        }
    };
