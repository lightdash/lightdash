/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { AuthorizationError } from '@lightdash/common';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import type { UserService } from '../../../services/UserService';

export const apiKeyPassportStrategy = ({
    userService,
}: {
    userService: UserService;
}) =>
    new HeaderAPIKeyStrategy(
        { header: 'Authorization', prefix: 'ApiKey ' },
        true,
        async (token, done) => {
            try {
                const user = await userService.loginWithPersonalAccessToken(
                    token,
                );
                return done(null, user);
            } catch {
                return done(
                    new AuthorizationError(
                        'Personal access token is not recognised',
                    ),
                );
            }
        },
    );
