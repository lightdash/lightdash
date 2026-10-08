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
    req.session.oauth ??= {};
    req.session.oauth.agentConnect = attempt;
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

const recordConnectOutcome = (
    req: Request,
    failureReason: AgentIdentityConnectFailureReason | null,
): void => {
    const attempt = req.session.oauth?.agentConnect;
    if (!attempt) return;
    req.services
        .getAiAccessService()
        .trackConnectOutcome(attempt, failureReason);
    delete req.session.oauth?.agentConnect;
};

const recordConnectError = (req: Request): void => {
    recordConnectOutcome(
        req,
        snowflakeAiPassportStrategy
            ? AgentIdentityConnectFailureReason.SIGN_IN_FAILED
            : AgentIdentityConnectFailureReason.NOT_CONFIGURED,
    );
};

export const authenticateAgentConnect: RequestHandler = (req, res, next) => {
    try {
        passport.authenticate('snowflake-ai', { scope: ['refresh_token'] })(
            req,
            res,
            (error: unknown) => {
                if (error) recordConnectError(req);
                next(error);
            },
        );
    } catch (error) {
        recordConnectError(req);
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
                    delete req.session.oauth?.agentConnect;
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
            if (error) recordConnectError(req);
            next(error);
        });
    } catch (error) {
        recordConnectError(req);
        next(error);
    }
};
