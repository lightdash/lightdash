import {
    AgentIdentityConnectFailureReason,
    ForbiddenError,
    getSnowflakeAgentRedirectUri,
    ParameterError,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import {
    Strategy as OAuth2Strategy,
    VerifyCallback,
    type StateStore,
} from 'passport-oauth2';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';
import { withCause } from '../../../logging/withCause';
import { type ResolvedSnowflakeAgentClient } from '../../../services/AiAccessService/SnowflakeAgentClientResolver';
import { AgentConnectStateStore } from './AgentConnectStateStore';

export const snowflakeAiSessionCheck = {
    check: checkSnowflakeAgentSessionWithToken,
};

export const createSnowflakeAiPassportStrategy = (
    client: ResolvedSnowflakeAgentClient,
): OAuth2Strategy =>
    new OAuth2Strategy(
        {
            authorizationURL: client.authorizationEndpoint,
            tokenURL: client.tokenEndpoint,
            clientID: client.clientId,
            clientSecret: client.clientSecret,
            callbackURL: getSnowflakeAgentRedirectUri(lightdashConfig.siteUrl),
            passReqToCallback: true,
            state: true,
            sessionKey: 'oauth2:snowflake-ai',
            store: new AgentConnectStateStore({
                organizationUuid: client.organizationUuid,
                clientVersion: client.clientVersion,
            }) as StateStore,
        },
        async (
            req: Express.Request,
            accessToken: string,
            refreshToken: string,
            params: { refresh_token_expires_in?: unknown },
            _profile: unknown,
            done: VerifyCallback,
        ) => {
            const verification: NonNullable<
                Express.Request['agentConnectVerification']
            > = { failureReason: null };
            req.agentConnectVerification = verification;
            try {
                if (!lightdashConfig.license.licenseKey) {
                    verification.failureReason =
                        AgentIdentityConnectFailureReason.LICENSE_REQUIRED;
                    throw new ForbiddenError(
                        'Enterprise license required for Snowflake AI sign-in',
                    );
                }
                const { user } = req;
                if (!user?.organizationUuid) {
                    verification.failureReason =
                        AgentIdentityConnectFailureReason.ORGANIZATION_REQUIRED;
                    throw new ForbiddenError(
                        'An organization sign-in is required',
                    );
                }
                await req.services.getAiAccessService().assertFeatureEnabled({
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                });
                if (!refreshToken) {
                    verification.failureReason =
                        AgentIdentityConnectFailureReason.NO_REFRESH_TOKEN;
                    throw new ParameterError(
                        'Snowflake did not return a refresh token. Please try signing in again.',
                    );
                }
                let sessionCheckError: unknown = null;
                const agentSession = await snowflakeAiSessionCheck
                    .check(client.account, accessToken, {
                        accessUrl: client.accessUrl,
                    })
                    .catch((error: unknown) => {
                        sessionCheckError = error;
                        verification.failureReason =
                            AgentIdentityConnectFailureReason.SESSION_CHECK_FAILED;
                        return null;
                    });
                if (!agentSession?.agentActivated) {
                    verification.failureReason ??=
                        AgentIdentityConnectFailureReason.NOT_AGENT_SESSION;
                    const refusal = new ForbiddenError(
                        SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
                    );
                    throw sessionCheckError === null
                        ? refusal
                        : withCause(refusal, sessionCheckError);
                }
                Logger.info('Snowflake agent session activated', {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                    currentRole: agentSession.currentRole,
                    activeRestrictedSessionScopes:
                        agentSession.activeRestrictedSessionScopes,
                });
                const seconds = params.refresh_token_expires_in;
                const expiresAt =
                    typeof seconds === 'number' &&
                    Number.isFinite(seconds) &&
                    seconds > 0
                        ? new Date(Date.now() + seconds * 1000)
                        : null;
                await req.services
                    .getUserService()
                    .upsertAiSnowflakeCredential(
                        user,
                        refreshToken,
                        expiresAt,
                        {
                            organizationUuid: client.organizationUuid,
                            clientVersion: client.clientVersion,
                        },
                    )
                    .catch((error: unknown) => {
                        verification.failureReason =
                            AgentIdentityConnectFailureReason.CREDENTIAL_SAVE_FAILED;
                        throw error;
                    });
                done(null, user);
            } catch (error) {
                done(error);
            }
        },
    );
