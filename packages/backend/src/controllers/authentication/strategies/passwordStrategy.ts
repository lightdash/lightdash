/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { AuthorizationError, LightdashError } from '@lightdash/common';
import { Strategy as LocalStrategy } from 'passport-local';
import type { UserService } from '../../../services/UserService';

export const localPassportStrategy = ({
    userService,
}: {
    userService: UserService;
}) =>
    new LocalStrategy(
        {
            usernameField: 'email',
            passwordField: 'password',
            passReqToCallback: true,
        },
        async (req, email, password, done) => {
            try {
                const user = await userService.loginWithPassword(
                    email,
                    password,
                    {
                        ip: req.ip,
                        userAgent: req.get('user-agent'),
                    },
                );
                return done(null, user);
            } catch (e) {
                return done(
                    e instanceof LightdashError
                        ? e
                        : new AuthorizationError(
                              'Unexpected error while logging in',
                          ),
                );
            }
        },
    );
