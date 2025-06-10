/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    AnyType,
    ForbiddenError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
} from '@lightdash/common';
import { Strategy as OAuth2Strategy, VerifyCallback } from 'passport-oauth2';
import { URL } from 'url';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

export const snowflakePassportStrategy = !(
    lightdashConfig.auth.snowflake.clientId &&
    lightdashConfig.auth.snowflake.clientSecret &&
    lightdashConfig.auth.snowflake.authorizationEndpoint &&
    lightdashConfig.auth.snowflake.tokenEndpoint
)
    ? undefined
    : // https://docs.snowflake.com/en/user-guide/oauth-custom
      new OAuth2Strategy(
          {
              authorizationURL:
                  lightdashConfig.auth.snowflake.authorizationEndpoint,
              tokenURL: lightdashConfig.auth.snowflake.tokenEndpoint,
              clientID: lightdashConfig.auth.snowflake.clientId,
              clientSecret: lightdashConfig.auth.snowflake.clientSecret,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.snowflake.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              passReqToCallback: true,
          },
          async (
              req: Express.Request,
              accessToken: string,
              refreshToken: string,
              profile: AnyType,
              done: VerifyCallback,
          ) => {
              try {
                  // TODO move to new /ee service
                  // No need to validate license here, it will be checked in the /ee/index.ts on startup
                  if (!lightdashConfig.license.licenseKey) {
                      throw new ForbiddenError(
                          `Enterprise license required for snowflake authentication`,
                      );
                  }

                  // TODO should we check also before we trigger the oauth flow ?
                  const loggedUser = req.user;
                  if (loggedUser === undefined) {
                      throw new ForbiddenError('User not authenticated');
                  }

                  // Snowflake returns this empty (are we missing a scope?)
                  const openIdUser: OpenIdUser = {
                      openId: {
                          subject: loggedUser.userUuid,
                          issuer: lightdashConfig.auth.snowflake
                              .authorizationEndpoint!,
                          issuerType: OpenIdIdentityIssuerType.SNOWFLAKE,
                          email: loggedUser.email!,
                          firstName: loggedUser.firstName,
                          lastName: loggedUser.lastName,
                      },
                  };
                  // we'll also be adding the token to the warehouse credentials
                  // so they can use it to query snowflake
                  Logger.info(
                      `Creating user warehouse credentials for snowflake`,
                  );
                  await req.services
                      .getUserService()
                      .createSnowflakeWarehouseCredentials(
                          req.user!,
                          refreshToken,
                      );

                  const user = await req.services
                      .getUserService()
                      .loginWithOpenId(
                          openIdUser,
                          req.user,
                          undefined,
                          refreshToken,
                      );
                  done(null, user);
                  // Use the generic OIDC handler to process the profile
              } catch (error) {
                  // Handle any errors that occur during processing
                  done(error);
              }
          },
      );
