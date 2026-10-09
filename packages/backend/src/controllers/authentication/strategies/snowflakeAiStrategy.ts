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
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { getSnowflakeAiAccount } from '../../../config/snowflakeAgentConfiguration';
import Logger from '../../../logging/logger';
import { withCause } from '../../../logging/withCause';
import { AgentConnectStateStore } from './AgentConnectStateStore';

const config = lightdashConfig.auth.snowflakeAi;

export const snowflakeAiSessionCheck = {
    check: checkSnowflakeAgentSessionWithToken,
};

export const snowflakeAiPassportStrategy = !(
    config.clientId &&
    config.clientSecret &&
    config.authorizationEndpoint &&
    config.tokenEndpoint
)
    ? undefined
    : new OAuth2Strategy(
          {
              authorizationURL: config.authorizationEndpoint,
              tokenURL: config.tokenEndpoint,
              clientID: config.clientId,
              clientSecret: config.clientSecret,
              callbackURL: getSnowflakeAgentRedirectUri(
                  lightdashConfig.siteUrl,
              ),
              passReqToCallback: true,
              state: true,
              sessionKey: 'oauth2:snowflake-ai',
              store: new AgentConnectStateStore() as StateStore,
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
                  const account = getSnowflakeAiAccount(config);
                  if (!account) {
                      verification.failureReason =
                          AgentIdentityConnectFailureReason.NOT_CONFIGURED;
                  }
                  let sessionCheckError: unknown = null;
                  const agentSession = account
                      ? await snowflakeAiSessionCheck
                            .check(account, accessToken, {
                                accessUrl: new URL(config.tokenEndpoint!)
                                    .origin,
                            })
                            .catch((error: unknown) => {
                                sessionCheckError = error;
                                verification.failureReason =
                                    AgentIdentityConnectFailureReason.SESSION_CHECK_FAILED;
                                return null;
                            })
                      : null;
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
