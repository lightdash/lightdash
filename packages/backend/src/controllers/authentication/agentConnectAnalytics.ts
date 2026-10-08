import {
    AgentIdentityConnectEntryPoint,
    AgentIdentityConnectFailureReason,
    FeatureNotEnabledError,
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
import { snowflakeAiPassportStrategy } from './strategies/snowflakeAiStrategy';

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
): void => {
    const attempt = consumeConnectAttempt(req);
    if (!attempt) return;
    req.services
        .getAiAccessService()
        .trackConnectOutcome(attempt, failureReason);
};

const getConnectErrorReason = () =>
    snowflakeAiPassportStrategy
        ? AgentIdentityConnectFailureReason.SIGN_IN_FAILED
        : AgentIdentityConnectFailureReason.NOT_CONFIGURED;

const recordConnectError = (req: Request, error: unknown): void => {
    if (error instanceof FeatureNotEnabledError) {
        consumeConnectAttempt(req);
        return;
    }
    recordConnectOutcome(req, getConnectErrorReason());
};

const recordConnectStartError = (req: Request): void => {
    const attempt = req.agentConnectAttempt;
    if (!attempt) return;
    req.agentConnectAttempt = null;
    const attempts = req.session.agentConnectAttempts;
    const state = Object.entries(attempts ?? {}).find(
        ([, pending]) => pending.connectAttemptId === attempt.connectAttemptId,
    )?.[0];
    if (attempts && state) delete attempts[state];
    req.services
        .getAiAccessService()
        .trackConnectOutcome(attempt, getConnectErrorReason());
};

export const authenticateAgentConnect: RequestHandler = (req, res, next) => {
    try {
        passport.authenticate('snowflake-ai', { scope: ['refresh_token'] })(
            req,
            res,
            (error: unknown) => {
                if (error) recordConnectStartError(req);
                next(error);
            },
        );
    } catch (error) {
        recordConnectStartError(req);
        next(error);
    }
};

export const agentConnectCallback: RequestHandler = (req, res, next) => {
    const state = req.session['oauth2:snowflake-ai']?.state;
    const tokenExchangeStarted =
        typeof req.query.code === 'string' &&
        !!state &&
        state === req.query.state;
    const accessDenied = req.query.error === 'access_denied';
    try {
        passport.authenticate(
            'snowflake-ai',
            (
                error: unknown,
                user: Express.User | false | null | undefined,
                _info: unknown,
                status?: number,
            ) => {
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
                    );
                }
                res.redirect(getAgentConnectRedirectURL(isSuccess, error)(req));
            },
        )(req, res, (error: unknown) => {
            if (error) recordConnectError(req, error);
            next(error);
        });
    } catch (error) {
        recordConnectError(req, error);
        next(error);
    }
};
