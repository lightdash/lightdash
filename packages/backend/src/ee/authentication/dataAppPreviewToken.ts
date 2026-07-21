import {
    AuthorizationError,
    extractAppSdkRouteProjectUuid,
    ForbiddenError,
    getErrorMessage,
    isAllowedAppSdkRoute,
} from '@lightdash/common';
import { createHmac } from 'crypto';
import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { fromApiKey } from '../../auth/account/account';
import { requestContextFromExpress } from '../../auth/account/requestContext';
import { lightdashConfig } from '../../config/lightdashConfig';

const TOKEN_TYPE = 'data-app-preview-api';
const TOKEN_ISSUER = 'lightdash';
const TOKEN_AUDIENCE = 'data-app-preview-api';

export const DATA_APP_PREVIEW_TOKEN_TTL_SECONDS = 600;

// Prefix-dispatched in `allowApiKeyAuthentication`, like `ldpat_` for PATs —
// an `ApiKey ldappprev_…` header always resolves here and nowhere else.
export const DATA_APP_PREVIEW_TOKEN_PREFIX = 'ldappprev_';

export type DataAppPreviewTokenPayload = {
    type: typeof TOKEN_TYPE;
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
};

/**
 * Purpose-specific signing key derived from the global lightdash secret, so
 * these tokens can never be confused with app-asset preview tokens or other
 * HMAC uses of the same root secret (same pattern as appPreviewToken.ts).
 */
const deriveSigningKey = (lightdashSecret: string): Buffer =>
    createHmac('sha256', lightdashSecret)
        .update('data-app-preview-api-token')
        .digest();

/**
 * Mints the short-lived, project-scoped token `lightdash apps preview`
 * exchanges the caller's durable credential for. Its authority is enforced
 * at verification time: only data-app SDK routes, only this project.
 */
export const mintDataAppPreviewToken = (
    lightdashSecret: string,
    args: {
        userUuid: string;
        organizationUuid: string;
        projectUuid: string;
    },
): { token: string; expiresAt: Date } => {
    const token = jwt.sign(
        {
            type: TOKEN_TYPE,
            userUuid: args.userUuid,
            organizationUuid: args.organizationUuid,
            projectUuid: args.projectUuid,
        } satisfies DataAppPreviewTokenPayload,
        deriveSigningKey(lightdashSecret),
        {
            expiresIn: DATA_APP_PREVIEW_TOKEN_TTL_SECONDS,
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
            algorithm: 'HS256',
        },
    );
    return {
        token: `${DATA_APP_PREVIEW_TOKEN_PREFIX}${token}`,
        expiresAt: new Date(
            Date.now() + DATA_APP_PREVIEW_TOKEN_TTL_SECONDS * 1000,
        ),
    };
};

type VerifySuccess = { ok: true; payload: DataAppPreviewTokenPayload };
type VerifyFailure = { ok: false; message: string };
export type VerifyDataAppPreviewTokenResult = VerifySuccess | VerifyFailure;

export const verifyDataAppPreviewToken = (
    prefixedToken: string,
    lightdashSecret: string,
): VerifyDataAppPreviewTokenResult => {
    if (!prefixedToken.startsWith(DATA_APP_PREVIEW_TOKEN_PREFIX)) {
        return { ok: false, message: 'Not a data-app preview token' };
    }
    const token = prefixedToken.slice(DATA_APP_PREVIEW_TOKEN_PREFIX.length);
    try {
        const decoded = jwt.verify(token, deriveSigningKey(lightdashSecret), {
            algorithms: ['HS256'],
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
        });
        if (typeof decoded === 'string' || decoded.type !== TOKEN_TYPE) {
            return {
                ok: false,
                message: 'Invalid or expired data-app preview token',
            };
        }
        return { ok: true, payload: decoded as DataAppPreviewTokenPayload };
    } catch {
        return {
            ok: false,
            message: 'Invalid or expired data-app preview token',
        };
    }
};

/**
 * Authenticates a request bearing `Authorization: ApiKey ldappprev_…`.
 * Exclusive: never falls back to other auth types. The token's authority is
 * strictly less than the credential it was exchanged for — only the data-app
 * SDK route allowlist (shared with the product bridge and the CLI preview
 * proxy), only the project it was minted for. In particular the mint
 * endpoint itself is not an SDK route, so a preview token can never refresh
 * itself.
 */
export const authenticateDataAppPreviewToken: RequestHandler = async (
    req,
    res,
    next,
) => {
    try {
        const header = req.headers.authorization ?? '';
        const [scheme, token] = header.split(' ');
        if (scheme !== 'ApiKey' || !token) {
            next(new AuthorizationError('Malformed authorization header'));
            return;
        }
        const result = verifyDataAppPreviewToken(
            token,
            lightdashConfig.lightdashSecret,
        );
        if (!result.ok) {
            next(new AuthorizationError(result.message));
            return;
        }

        const { pathname } = new URL(req.originalUrl, 'http://localhost');
        if (!isAllowedAppSdkRoute(req.method, pathname)) {
            next(
                new ForbiddenError(
                    'Data-app preview tokens can only access data-app SDK routes',
                ),
            );
            return;
        }
        const routeProjectUuid = extractAppSdkRouteProjectUuid(pathname);
        if (
            routeProjectUuid !== null &&
            routeProjectUuid !== result.payload.projectUuid
        ) {
            next(
                new ForbiddenError(
                    'This data-app preview token is scoped to a different project',
                ),
            );
            return;
        }

        const user = await req.services.getUserService().findSessionUser({
            id: result.payload.userUuid,
            organization: result.payload.organizationUuid,
        });
        req.user = user;
        req.account = fromApiKey(user, header);
        const requestContext = requestContextFromExpress(req);
        req.account.requestContext = requestContext;
        req.user.requestContext = requestContext;
        next();
    } catch (error) {
        next(new AuthorizationError(getErrorMessage(error)));
    }
};
