import {
    AgentIdentityConnectEntryPoint,
    AgentIdentityConnectFailureReason,
    FeatureNotEnabledError,
    ForbiddenError,
} from '@lightdash/common';
import { type Request, type RequestHandler } from 'express';
import passport from 'passport';
import {
    AuthorizationError,
    InternalOAuthError,
    TokenError,
} from 'passport-oauth2';
import { v4 as uuid } from 'uuid';
import { getAgentConnectRedirectURL } from './agentConnectRedirect';
import { createSnowflakeAiPassportStrategy } from './strategies/snowflakeAiStrategy';

export const storeAgentConnectAttempt: RequestHandler = async (
    req,
    _res,
    next,
) => {
    const { user } = req;
    if (!user?.organizationUuid) {
        next();
        return;
    }
    const service = req.services.getAiAccessService();
    const entryPoint =
        Object.values(AgentIdentityConnectEntryPoint).find(
            (value) => value === req.query.entryPoint,
        ) ?? AgentIdentityConnectEntryPoint.UNKNOWN;
    const projectId = await service.getConnectProjectId(
        req.account ?? null,
        req.query.project,
        user.organizationUuid,
    );
    const attempt = {
        connectAttemptId: uuid(),
        organizationId: user.organizationUuid,
        userId: user.userUuid,
        projectId,
        entryPoint,
    };
    req.agentConnectAttempt = attempt;
    service.trackConnectStarted(attempt);
    next();
};

type ConnectFailure = {
    error: unknown;
    user: Express.User | false | null | undefined;
    status: number | undefined;
    accessDenied: boolean;
    tokenExchangeStarted: boolean;
    verification: Express.Request['agentConnectVerification'];
};

export const classifyAgentConnectFailure = ({
    error,
    user,
    status,
    accessDenied,
    tokenExchangeStarted,
    verification,
}: ConnectFailure): AgentIdentityConnectFailureReason => {
    if (verification?.failureReason) return verification.failureReason;
    if (error instanceof AuthorizationError) {
        return error.code === 'access_denied'
            ? AgentIdentityConnectFailureReason.ACCESS_DENIED
            : AgentIdentityConnectFailureReason.OAUTH_ERROR;
    }
    if (error instanceof TokenError || error instanceof InternalOAuthError) {
        return AgentIdentityConnectFailureReason.TOKEN_EXCHANGE_FAILED;
    }
    if (!error && user === false) {
        if (accessDenied)
            return AgentIdentityConnectFailureReason.ACCESS_DENIED;
        if (status === 403)
            return AgentIdentityConnectFailureReason.STATE_MISMATCH;
    }
    if (error && tokenExchangeStarted && !verification) {
        return AgentIdentityConnectFailureReason.TOKEN_EXCHANGE_FAILED;
    }
    return AgentIdentityConnectFailureReason.SIGN_IN_FAILED;
};

const consumeConnectAttempt = (req: Request) => {
    const { state } = req.query;
    const attempts = req.session.agentConnectAttempts;
    if (
        typeof state !== 'string' ||
        !attempts ||
        !Object.hasOwn(attempts, state)
    )
        return null;
    const attempt = attempts[state];
    delete attempts[state];
    return attempt;
};

const recordConnectOutcome = (
    req: Request,
    failureReason: AgentIdentityConnectFailureReason | null,
    error: unknown = null,
): void => {
    const attempt = consumeConnectAttempt(req);
    if (!attempt) return;
    const sessionCheckError =
        failureReason ===
            AgentIdentityConnectFailureReason.SESSION_CHECK_FAILED &&
        error instanceof Error
            ? (error.cause ?? null)
            : null;
    req.services
        .getAiAccessService()
        .trackConnectOutcome(attempt, failureReason, sessionCheckError);
};

const recordConnectError = (
    req: Request,
    error: unknown,
    reason: AgentIdentityConnectFailureReason,
): void => {
    if (error instanceof FeatureNotEnabledError) {
        consumeConnectAttempt(req);
        return;
    }
    recordConnectOutcome(req, reason);
};

const recordConnectStartError = (
    req: Request,
    reason: AgentIdentityConnectFailureReason,
): void => {
    const attempt = req.agentConnectAttempt;
    if (!attempt) return;
    req.agentConnectAttempt = null;
    const attempts = req.session.agentConnectAttempts;
    const state = Object.entries(attempts ?? {}).find(
        ([, pending]) => pending.connectAttemptId === attempt.connectAttemptId,
    )?.[0];
    if (attempts && state) delete attempts[state];
    if (state && req.session.agentConnectBindings)
        delete req.session.agentConnectBindings[state];
    req.services.getAiAccessService().trackConnectOutcome(attempt, reason);
};

export const authenticateAgentConnect: RequestHandler = async (
    req,
    res,
    next,
) => {
    let reason = AgentIdentityConnectFailureReason.NOT_CONFIGURED;
    try {
        const client = req.user?.organizationUuid
            ? await req.services
                  .getAiAccessService()
                  .resolveSnowflakeAgentClient(req.user.organizationUuid)
            : null;
        if (!client)
            throw new Error(
                'Snowflake agent sign-in is not set up for this organisation.',
            );
        reason = AgentIdentityConnectFailureReason.SIGN_IN_FAILED;
        passport.authenticate(createSnowflakeAiPassportStrategy(client), {
            scope: ['refresh_token'],
        })(req, res, (error: unknown) => {
            if (error) recordConnectStartError(req, reason);
            next(error);
        });
    } catch (error) {
        recordConnectStartError(req, reason);
        next(error);
    }
};

export const agentConnectCallback: RequestHandler = async (req, res, next) => {
    const state = req.session['oauth2:snowflake-ai']?.state;
    const consumeCallbackState = () => {
        const callbackState = req.query.state;
        if (typeof callbackState !== 'string') return;
        if (req.session.agentConnectBindings)
            delete req.session.agentConnectBindings[callbackState];
        if (req.session['oauth2:snowflake-ai']?.state === callbackState)
            delete req.session['oauth2:snowflake-ai'];
    };
    const tokenExchangeStarted =
        typeof req.query.code === 'string' &&
        !!state &&
        state === req.query.state;
    const accessDenied = req.query.error === 'access_denied';
    if (!req.user?.organizationUuid) {
        consumeCallbackState();
        recordConnectOutcome(
            req,
            AgentIdentityConnectFailureReason.ORGANIZATION_REQUIRED,
        );
        res.redirect(
            getAgentConnectRedirectURL(
                false,
                new ForbiddenError('An organization sign-in is required'),
            )(req),
        );
        return;
    }
    let reason = AgentIdentityConnectFailureReason.NOT_CONFIGURED;
    try {
        const client = req.user?.organizationUuid
            ? await req.services
                  .getAiAccessService()
                  .resolveSnowflakeAgentClient(req.user.organizationUuid)
            : null;
        if (!client)
            throw new Error(
                'Snowflake agent sign-in is not set up for this organisation.',
            );
        reason = AgentIdentityConnectFailureReason.SIGN_IN_FAILED;
        const bindings = req.session.agentConnectBindings;
        const callbackState = req.query.state;
        const binding =
            typeof callbackState === 'string' &&
            bindings &&
            Object.hasOwn(bindings, callbackState)
                ? bindings[callbackState]
                : null;
        if (
            !binding ||
            binding.organizationUuid !== req.user?.organizationUuid ||
            binding.clientVersion !== client.clientVersion
        ) {
            consumeCallbackState();
            recordConnectOutcome(req, reason);
            res.redirect(
                getAgentConnectRedirectURL(
                    false,
                    new ForbiddenError(
                        'The Snowflake agent sign-in settings changed. Sign in again.',
                    ),
                )(req),
            );
            return;
        }
        passport.authenticate(
            createSnowflakeAiPassportStrategy(client),
            (
                error: unknown,
                user: Express.User | false | null | undefined,
                _info: unknown,
                status?: number,
            ) => {
                consumeCallbackState();
                const isSuccess = !error && !!user;
                if (error instanceof FeatureNotEnabledError) {
                    consumeConnectAttempt(req);
                } else {
                    recordConnectOutcome(
                        req,
                        isSuccess
                            ? null
                            : classifyAgentConnectFailure({
                                  error,
                                  user,
                                  status,
                                  accessDenied,
                                  tokenExchangeStarted,
                                  verification: req.agentConnectVerification,
                              }),
                        error,
                    );
                }
                res.redirect(getAgentConnectRedirectURL(isSuccess, error)(req));
            },
        )(req, res, (error: unknown) => {
            consumeCallbackState();
            if (error) recordConnectError(req, error, reason);
            next(error);
        });
    } catch (error) {
        consumeCallbackState();
        recordConnectError(req, error, reason);
        next(error);
    }
};
