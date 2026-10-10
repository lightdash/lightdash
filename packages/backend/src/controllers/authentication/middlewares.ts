/// <reference path="../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../@types/express-session.d.ts" />
import {
    AgentActorSurface,
    ApiError,
    assertRegisteredAccount,
    AuthorizationError,
    DeactivatedAccountError,
    InvalidUser,
    LightdashMode,
    SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { ErrorRequestHandler, Request, RequestHandler } from 'express';
import passport from 'passport';
import { URL } from 'url';
import { fromApiKey, fromOauth } from '../../auth/account/account';
import { requestContextFromExpress } from '../../auth/account/requestContext';
import { buildAccountExistsWarning } from '../../auth/account/warnAccountExists';
import { resolveOAuthScopeMode } from '../../auth/oauthScopes/mode';
import {
    oauthApiResource,
    oauthMcpResource,
} from '../../auth/oauthScopes/oauthResources';
import {
    getOAuthRouteResource,
    resolveOAuthRouteOperation,
} from '../../auth/oauthScopes/routeOperation';
import { OAuthScopePolicy } from '../../auth/oauthScopes/scopedAbility';
import { OAuthBearerRefusalError } from '../../auth/oauthScopes/security';
import {
    assertOAuthScopeOperation,
    OAUTH_UNCHECKED_OPERATIONS,
} from '../../auth/oauthScopes/unchecked';
import { lightdashConfig } from '../../config/lightdashConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import Logger from '../../logging/logger';

const isMcpRequest = (req: Request): boolean =>
    req.baseUrl.toLowerCase().endsWith('/mcp');

const refuseOAuthToken = (
    req: Request,
    res: Parameters<RequestHandler>[1],
): void => {
    if (isMcpRequest(req)) {
        const siteUrl = oauthApiResource(
            req.services.getOauthService().getSiteUrl(),
        );
        res.set(
            'WWW-Authenticate',
            `Bearer resource_metadata="${siteUrl}/api/v1/oauth/.well-known/oauth-protected-resource", error="invalid_token"`,
        );
    }
    res.status(401).json({ error: 'invalid_token' });
};

export const acceptAnyOAuthAudience: RequestHandler = (_req, res, next) => {
    res.locals.acceptAnyOAuthAudience = true;
    next();
};

const hasWrongOAuthAudience = (
    req: Request,
    token: OAuth2Server.Token,
): boolean => {
    if (token.resource === null || token.resource === undefined) return false;
    if (req.res?.locals.acceptAnyOAuthAudience === true) return false;
    const siteUrl = req.services.getOauthService().getSiteUrl();
    return (
        token.resource !==
        (isMcpRequest(req)
            ? oauthMcpResource(siteUrl)
            : oauthApiResource(siteUrl))
    );
};

const getOAuthScopePolicy = async (
    req: Request,
    user: SessionUser,
    enforceGrant = false,
): Promise<OAuthScopePolicy | null> => {
    const mode = await resolveOAuthScopeMode(
        req.services.getFeatureFlagService(),
        user,
    );
    if (mode === null && !enforceGrant) return null;
    return {
        mode: enforceGrant ? 'enforce' : mode!,
        getRequest: () => {
            const route = req.route as { path: unknown } | undefined;
            return {
                method: req.method,
                routeTemplate:
                    !req.baseUrl.endsWith('/mcp') &&
                    typeof route?.path === 'string'
                        ? route.path
                        : null,
            };
        },
    };
};

const assertOAuthAgentOperation = async (req: Request): Promise<void> => {
    const { account } = req;
    if (
        account?.authentication.type !== 'oauth' ||
        !account.organization.organizationUuid
    )
        return;
    assertRegisteredAccount(account);
    const operation = resolveOAuthRouteOperation(req);
    const grantProjectUuids =
        account.authentication.agentConnectionGrant && !isMcpRequest(req)
            ? await req.services
                  .getAgentConnectionGrantService()
                  .assertRestOperation(req, operation)
            : null;
    const scopeOperation =
        operation !== null &&
        Object.hasOwn(OAUTH_UNCHECKED_OPERATIONS, operation)
            ? (operation as keyof typeof OAUTH_UNCHECKED_OPERATIONS)
            : null;
    if (grantProjectUuids !== null && scopeOperation !== null)
        assertOAuthScopeOperation(account, scopeOperation);
    if (isMcpRequest(req)) return;
    const service = req.services.getAgentPermissionService();
    if (!(await service.isManaged(account.organization.organizationUuid)))
        return;
    if (grantProjectUuids === null && scopeOperation !== null)
        assertOAuthScopeOperation(account, scopeOperation);
    if (grantProjectUuids !== null) {
        await Promise.all(
            (grantProjectUuids.length === 0 ? [null] : grantProjectUuids).map(
                (projectUuid) =>
                    service.assertOperation({
                        account,
                        organizationUuid:
                            account.organization.organizationUuid!,
                        projectUuid,
                        kind: 'rest_operation',
                        key: operation ?? 'unknown',
                        surface: AgentActorSurface.API,
                    }),
            ),
        );
        return;
    }
    let projectUuid =
        typeof req.params.projectUuid === 'string'
            ? req.params.projectUuid
            : null;
    if (projectUuid === null && operation !== null) {
        const resource = getOAuthRouteResource(req);
        if (resource)
            projectUuid = await service.resolveResourceProjectUuid(resource);
    }
    await service.assertOperation({
        account,
        organizationUuid: account.organization.organizationUuid,
        projectUuid,
        kind: 'rest_operation',
        key: operation ?? 'unknown',
        surface: AgentActorSurface.API,
    });
};

export const isAuthenticated: RequestHandler = (req, res, next) => {
    if (req.account?.isAuthenticated() || req.user?.userUuid) {
        // Service-account principals run on a dedicated user row that is
        // intentionally `is_active = false` (defense-in-depth against any
        // login path). The `isActive` gate is for human deactivation, so
        // skip it for the service-account auth type.
        if (
            req.account?.authentication?.type === 'service-account' ||
            req.account?.user?.isActive ||
            req.user?.isActive
        ) {
            next();
        } else {
            // Destroy session if user is deactivated and return error
            req.session.destroy((err) => {
                if (err) {
                    next(err);
                } else {
                    next(new DeactivatedAccountError());
                }
            });
        }
    } else {
        next(new AuthorizationError(`Failed to authorize user`));
    }
};

export const unauthorisedInDemo: RequestHandler = (req, res, next) => {
    if (lightdashConfig.mode === LightdashMode.DEMO) {
        throw new AuthorizationError('Action not available in demo');
    } else {
        next();
    }
};

const hasSessionAndBearer = (req: Request): boolean =>
    req.isAuthenticated() &&
    /^Bearer\s+\S+$/i.test(req.headers.authorization ?? '');

/*
This middleware allows ONLY OAuth bearer token authentication (no PAT, no service account).
Used for endpoints that intentionally exclude PAT auth, e.g. creating a PAT from an OAuth token.
For most endpoints, use allowApiKeyAuthentication which includes OAuth + all other auth methods.
*/
export const allowOauthAuthentication: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated() && !hasSessionAndBearer(req)) {
        next();
        return;
    }
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    req.services
        .getOauthService()
        .authenticate(oauthReq, oauthRes)
        .then((token) => {
            if (
                hasSessionAndBearer(req) &&
                token.agentConnectionGrantUuid == null
            ) {
                next();
                return;
            }

            if (hasWrongOAuthAudience(req, token)) {
                refuseOAuthToken(req, res);
                return;
            }
            req.services
                .getUserService()
                .findSessionUser({
                    id: token.user.userUuid,
                    organization: token.user.organizationUuid,
                })
                .then(async (user) => {
                    if (req.account?.isAuthenticated()) {
                        Logger.warn(
                            buildAccountExistsWarning('OAuth'),
                            req.account?.authentication?.type,
                        );
                    }
                    if (!user && token.agentConnectionGrantUuid != null)
                        throw new OAuthBearerRefusalError();
                    req.user = user;
                    if (user) {
                        const grant =
                            token.agentConnectionGrantUuid == null
                                ? null
                                : await req.services
                                      .getAgentConnectionGrantService()
                                      .authenticate(token, user);
                        const scopePolicy = await getOAuthScopePolicy(
                            req,
                            user,
                            grant !== null,
                        );
                        req.account = fromOauth(
                            user,
                            token,
                            scopePolicy,
                            grant,
                        );
                        const requestContext = requestContextFromExpress(req);
                        req.account.requestContext = requestContext;
                        req.user = {
                            ...user,
                            ability: req.account.user.ability,
                            abilityRules: req.account.user.abilityRules,
                            requestContext,
                        };
                        await assertOAuthAgentOperation(req);
                    }
                    next();
                })
                .catch((userError) => {
                    if (userError instanceof OAuthBearerRefusalError) {
                        refuseOAuthToken(req, res);
                        return;
                    }
                    next(userError);
                });
        })
        .catch((error) => {
            if (error instanceof OAuthBearerRefusalError) {
                refuseOAuthToken(req, res);
                return;
            }
            // Not an OAuth token — continue without authenticating
            next();
        });
};

/*
This middleware is used to enable OAuth, Api tokens, and service accounts.
We first try OAuth (bearer header), then service accounts (bearer header),
then Personal access tokens (ApiKey header), which can throw an error if the token is invalid.
*/
export const allowApiKeyAuthentication: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated() && !hasSessionAndBearer(req)) {
        next();
        return;
    }

    const authenticateWithServiceAccountOrPat = () => {
        if (req.isAuthenticated()) {
            next();
            return;
        }

        const authenticateWithPat = () => {
            if (req.isAuthenticated()) {
                next();
                return;
            }
            if (!lightdashConfig.auth.pat.enabled) {
                throw new AuthorizationError(
                    'Personal access tokens are disabled',
                );
            }
            passport.authenticate('headerapikey', { session: false })(
                req,
                res,
                () => {
                    if (req?.account?.isAuthenticated()) {
                        Logger.warn(
                            buildAccountExistsWarning('ApiKey'),
                            req.account?.authentication?.type,
                        );
                    }

                    if (req.user) {
                        req.account = fromApiKey(
                            req.user!,
                            req.headers.authorization || '',
                        );
                        const requestContext = requestContextFromExpress(req);
                        req.account.requestContext = requestContext;
                        req.user.requestContext = requestContext;
                    }
                    next();
                },
            );
        };
        try {
            authenticateServiceAccount(req, res, authenticateWithPat);
        } catch (e) {
            authenticateWithPat();
        }
    };

    // Try OAuth bearer token first
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    req.services
        .getOauthService()
        .authenticate(oauthReq, oauthRes)
        .then((token) => {
            if (
                hasSessionAndBearer(req) &&
                token.agentConnectionGrantUuid == null
            ) {
                next();
                return;
            }

            if (hasWrongOAuthAudience(req, token)) {
                refuseOAuthToken(req, res);
                return;
            }
            req.services
                .getUserService()
                .findSessionUser({
                    id: token.user.userUuid,
                    organization: token.user.organizationUuid,
                })
                .then(async (user) => {
                    if (req.account?.isAuthenticated()) {
                        Logger.warn(
                            buildAccountExistsWarning('OAuth'),
                            req.account?.authentication?.type,
                        );
                    }
                    if (!user && token.agentConnectionGrantUuid != null)
                        throw new OAuthBearerRefusalError();
                    req.user = user;
                    if (user) {
                        const grant =
                            token.agentConnectionGrantUuid == null
                                ? null
                                : await req.services
                                      .getAgentConnectionGrantService()
                                      .authenticate(token, user);
                        const scopePolicy = await getOAuthScopePolicy(
                            req,
                            user,
                            grant !== null,
                        );
                        req.account = fromOauth(
                            user,
                            token,
                            scopePolicy,
                            grant,
                        );
                        const requestContext = requestContextFromExpress(req);
                        req.account.requestContext = requestContext;
                        req.user = {
                            ...user,
                            ability: req.account.user.ability,
                            abilityRules: req.account.user.abilityRules,
                            requestContext,
                        };
                        await assertOAuthAgentOperation(req);
                    }
                    next();
                })
                .catch((userError) => {
                    if (userError instanceof OAuthBearerRefusalError) {
                        refuseOAuthToken(req, res);
                        return;
                    }
                    // Valid oauth token but user not found — throw
                    next(userError);
                });
        })
        .catch((error) => {
            if (error instanceof OAuthBearerRefusalError) {
                refuseOAuthToken(req, res);
                return;
            }
            // Not an OAuth token — try service account and PAT
            authenticateWithServiceAccountOrPat();
        });
};

/**
 * For routes that anonymous callers may hit (the login and invite pages read
 * feature flags) but that the CLI also calls with a personal access token or
 * service account: authenticate the token when one is sent, otherwise carry
 * on unauthenticated instead of rejecting the request.
 */
export const allowApiKeyAuthenticationIfPresent: RequestHandler = (
    req,
    res,
    next,
) => {
    if (!req.headers.authorization) {
        next();
        return;
    }
    allowApiKeyAuthentication(req, res, (err?: unknown) => {
        if (err) {
            next(err);
            return;
        }
        // A token was sent but matched nothing: reject rather than answer as
        // an anonymous caller, so a CLI with a bad key fails loudly.
        if (req.account?.isAuthenticated() || req.user?.userUuid) {
            next();
            return;
        }
        next(new AuthorizationError('Invalid credentials'));
    });
};

export const storeOIDCRedirect: RequestHandler = (req, res, next) => {
    const { redirect, inviteCode, isPopup } = req.query;
    req.session.oauth = {};
    if (typeof inviteCode === 'string') {
        req.session.oauth.inviteCode = inviteCode;
    }
    if (typeof redirect === 'string') {
        try {
            const redirectUrl = new URL(redirect, lightdashConfig.siteUrl);
            const originUrl = new URL(lightdashConfig.siteUrl);
            if (
                redirectUrl.host === originUrl.host ||
                process.env.NODE_ENV === 'development'
            ) {
                req.session.oauth.returnTo = redirectUrl.href;
            }
        } catch (e) {
            next(); // fail silently if we can't parse url
        }
    }
    if (typeof isPopup === 'string' && isPopup === 'true') {
        req.session.oauth.isPopup = true;
    }
    next();
};

export const storeOIDCLinkIntent: RequestHandler = (req, res, next) => {
    req.session.oauth = req.session.oauth || {};
    req.session.oauth.intent = 'link';
    next();
};

export const storeSlackContext: RequestHandler = (req, res, next) => {
    const { team, channel, message, thread_ts: threadTs, trigger } = req.query;
    req.session.slack = {};

    if (typeof team === 'string') {
        req.session.slack.teamId = team;
    }
    if (typeof channel === 'string') {
        req.session.slack.channelId = channel;
    }
    if (typeof message === 'string') {
        req.session.slack.messageTs = message;
    }
    if (typeof threadTs === 'string') {
        req.session.slack.threadTs = threadTs;
    }
    if (trigger === 'vote' || trigger === 'app_mention') {
        req.session.slack.trigger = trigger;
    }

    next();
};

export const getOidcRedirectURL =
    (isSuccess: boolean) =>
    (req: Request): string => {
        if (req.session.oauth?.isPopup) {
            return new URL(
                isSuccess ? '/auth/popup/success' : '/auth/popup/failure',
                lightdashConfig.siteUrl,
            ).href;
        }
        if (
            req.session.oauth?.returnTo &&
            typeof req.session.oauth?.returnTo === 'string'
        ) {
            const returnUrl = new URL(
                req.session.oauth?.returnTo,
                lightdashConfig.siteUrl,
            );
            if (returnUrl.host === new URL(lightdashConfig.siteUrl).host) {
                return returnUrl.href;
            }
        }
        return new URL('/', lightdashConfig.siteUrl).href;
    };

export const invalidUserErrorHandler: ErrorRequestHandler = (
    err,
    req,
    res,
    next,
) => {
    if (!(err instanceof InvalidUser)) {
        next(err);
        return;
    }

    req.session.destroy((error) => {
        if (error) Logger.error(error);
        if (req.url.includes('/api')) {
            const apiErrorResponse: ApiError = {
                status: 'error',
                error: {
                    statusCode: err.statusCode,
                    name: err.name,
                    message: err.message,
                    data: err.data,
                },
            };

            res.status(401).send(apiErrorResponse);
            return;
        }

        // if original url is an invite link, redirect to it
        if (
            req.path.match(
                // invite link regex
                /^\/invite\/([A-Za-z0-9_-]{30})$/,
            )
        ) {
            Logger.info(`Invalid user, redirecting to ${req.path}`);
            res.redirect(req.path);
            return;
        }

        Logger.info('Invalid user, redirecting to login');
        res.redirect('/login');
    });
};
