/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import { AuthorizationError } from '@lightdash/common';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { verifyPreviewApiToken } from '../../../routers/appPreviewToken';
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
                const user =
                    await userService.loginWithPersonalAccessToken(token);
                return done(null, user);
            } catch {
                // PAT lookup failed — try app preview JWT as fallback.
                // The SDK sends preview JWTs via the same Authorization: ApiKey header.
                const jwtResult = verifyPreviewApiToken(
                    token,
                    lightdashConfig.lightdashSecret,
                );

                if (jwtResult.ok) {
                    try {
                        const user = await userService.findSessionUser({
                            id: jwtResult.payload.userUuid,
                            organization: jwtResult.payload.organizationUuid,
                        });
                        return done(null, user);
                    } catch {
                        // JWT valid but user not found
                    }
                }

                return done(
                    new AuthorizationError(
                        'Personal access token is not recognised',
                    ),
                );
            }
        },
    );
