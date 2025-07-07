/// <reference path="../../../@types/passport-slack-oauth2.d.ts" />
import {
    ForbiddenError,
    getErrorMessage,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { Strategy as SlackStrategy } from 'passport-slack-oauth2';
import { lightdashConfig } from '../../../config/lightdashConfig';

export const slackPassportStrategy = !(
    lightdashConfig.slack?.clientId && lightdashConfig.slack?.clientSecret
)
    ? undefined
    : new SlackStrategy(
          {
              scope: ['openid', 'identity.basic'],
              clientID: lightdashConfig.slack.clientId,
              clientSecret: lightdashConfig.slack.clientSecret,
              callbackURL: `${lightdashConfig.siteUrl}/api/v1/auth/slack/callback`,
              state: true,
              passReqToCallback: true,
          },
          async (req, accessToken, refreshToken, profile, done) => {
              if (!req.user || req.user.email === undefined) {
                  return done(new ForbiddenError('Invalid user'));
              }

              const openIdUser: OpenIdUser = {
                  openId: {
                      subject: profile.id,
                      issuer: 'slack-oauth2',
                      issuerType: OpenIdIdentityIssuerType.SLACK,
                      email: req.user.email,
                      firstName: profile.user.name.split(' ')[0],
                      lastName: profile.user.name.split(' ')[1],
                      groups: undefined,
                      teamId: profile.team.id,
                  },
              };

              try {
                  // This might throw an error if the user is already linked to the identity
                  await req.services
                      .getUserService()
                      .linkOpenIdIdentityToUser(req.user, openIdUser);
                  return done(null);
              } catch (e: unknown) {
                  if (
                      e &&
                      typeof e === 'object' &&
                      'code' in e &&
                      e.code === '23505'
                  ) {
                      // Postgres duplicate key error code
                      console.warn(
                          `Trying to link open id to user ${req.user.userUuid} but user is already linked`,
                      );
                      return done(null); // Silent error if user is already linked to the identity
                  }
                  console.error(
                      `Unable to link open id to user ${req.user.userUuid}`,
                      e,
                  );
                  return done(new UnexpectedDatabaseError(getErrorMessage(e)));
              }
          },
      );
