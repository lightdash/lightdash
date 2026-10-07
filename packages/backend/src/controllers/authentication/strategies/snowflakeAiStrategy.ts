import { ForbiddenError, ParameterError } from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import { Strategy as OAuth2Strategy, VerifyCallback } from 'passport-oauth2';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

const config = lightdashConfig.auth.snowflakeAi;

export const snowflakeAiSessionCheck = {
    check: checkSnowflakeAgentSessionWithToken,
};

const getSnowflakeAiAccount = (): string | null => {
    if (config.account) return config.account;
    if (!config.tokenEndpoint) return null;
    try {
        const host = new URL(config.tokenEndpoint).hostname.toLowerCase();
        const suffix = '.snowflakecomputing.com';
        return host.endsWith(suffix) ? host.slice(0, -suffix.length) : null;
    } catch {
        return null;
    }
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
              callbackURL: new URL(
                  `/api/v1${config.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              passReqToCallback: true,
              state: true,
              sessionKey: 'oauth2:snowflake-ai',
          },
          async (
              req: Express.Request,
              accessToken: string,
              refreshToken: string,
              _profile: unknown,
              done: VerifyCallback,
          ) => {
              try {
                  if (!lightdashConfig.license.licenseKey) {
                      throw new ForbiddenError(
                          'Enterprise license required for Snowflake AI sign-in',
                      );
                  }
                  const { user } = req;
                  if (!user?.organizationUuid) {
                      throw new ForbiddenError(
                          'An organization sign-in is required',
                      );
                  }
                  await req.services.getAiAccessService().assertFeatureEnabled({
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  });
                  if (!refreshToken) {
                      throw new ParameterError(
                          'Snowflake did not return a refresh token. Please try signing in again.',
                      );
                  }
                  const account = getSnowflakeAiAccount();
                  const agentSession = account
                      ? await snowflakeAiSessionCheck
                            .check(account, accessToken, {
                                accessUrl: new URL(config.tokenEndpoint!)
                                    .origin,
                            })
                            .catch(() => null)
                      : null;
                  if (!agentSession?.agentActivated) {
                      throw new ForbiddenError(
                          SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
                      );
                  }
                  Logger.info('Snowflake agent session activated', {
                      currentRole: agentSession.currentRole,
                      activeRestrictedSessionScopes:
                          agentSession.activeRestrictedSessionScopes,
                  });
                  await req.services
                      .getUserService()
                      .upsertAiSnowflakeCredential(user, refreshToken);
                  done(null, user);
              } catch (error) {
                  done(error);
              }
          },
      );
