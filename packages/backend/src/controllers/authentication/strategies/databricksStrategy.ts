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

export const databricksPassportStrategy = !(
    lightdashConfig.auth.databricks.clientId &&
    lightdashConfig.auth.databricks.clientSecret &&
    lightdashConfig.auth.databricks.authorizationEndpoint &&
    lightdashConfig.auth.databricks.tokenEndpoint
)
    ? undefined
    : // https://docs.databricks.com/en/dev-tools/auth/oauth-u2m.html
      new OAuth2Strategy(
          {
              authorizationURL:
                  lightdashConfig.auth.databricks.authorizationEndpoint,
              tokenURL: lightdashConfig.auth.databricks.tokenEndpoint,
              clientID: lightdashConfig.auth.databricks.clientId,
              clientSecret: lightdashConfig.auth.databricks.clientSecret,
              callbackURL: new URL(
                  `/api/v1${lightdashConfig.auth.databricks.callbackPath}`,
                  lightdashConfig.siteUrl,
              ).href,
              scope: ['sql', 'offline_access'],
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
                  if (!lightdashConfig.license.licenseKey) {
                      throw new ForbiddenError(
                          `Enterprise license required for databricks authentication`,
                      );
                  }

                  const loggedUser = req.user;
                  if (loggedUser === undefined) {
                      throw new ForbiddenError('User not authenticated');
                  }

                  // Databricks OAuth doesn't return user profile in the token response
                  // We use the existing logged-in user's information
                  const openIdUser: OpenIdUser = {
                      openId: {
                          subject: loggedUser.userUuid,
                          issuer: lightdashConfig.auth.databricks
                              .authorizationEndpoint!,
                          issuerType: OpenIdIdentityIssuerType.DATABRICKS,
                          email: loggedUser.email!,
                          firstName: loggedUser.firstName,
                          lastName: loggedUser.lastName,
                      },
                  };

                  // Create user warehouse credentials with the refresh token
                  // so they can use it to query Databricks SQL warehouses
                  Logger.info(
                      `Creating user warehouse credentials for Databricks`,
                  );
                  await req.services
                      .getUserService()
                      .createDatabricksWarehouseCredentials(
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
              } catch (error) {
                  // Handle any errors that occur during processing
                  done(error);
              }
          },
      );
