import { assertRegisteredAccount, getErrorMessage } from '@lightdash/common';
import { type NextFunction, type Request, type Response } from 'express';
import Logger from '../../logging/logger';
import { type ExternalConnectionService } from '../services/ExternalConnectionService/ExternalConnectionService';

/** True when Google's callback belongs to a live-source sign-in rather than to logging in. */
export const isGoogleLiveSourceCallback = (req: Request): boolean =>
    !!req.session.oauth?.googleLiveSource &&
    typeof req.query.state === 'string' &&
    req.query.state === req.session.oauth.state;

/** Finishes a live-source Google sign-in and returns to the Live data sources page. */
export const handleGoogleLiveSourceCallback = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    const session = req.session.oauth?.googleLiveSource;
    if (!session) {
        next();
        return;
    }
    req.session.oauth = {};
    const service =
        req.services.getExternalConnectionService<ExternalConnectionService>();
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    if (!code || req.query.error) {
        res.redirect(
            service.getLiveDataSourcesUrl(session.projectUuid, {
                error: 'Google sign-in was cancelled',
            }),
        );
        return;
    }
    try {
        assertRegisteredAccount(req.account);
        const result = await service.completeGoogleOAuth(
            req.account,
            session,
            code,
        );
        if ('pending' in result) {
            req.session.pendingGoogleLiveSource = result.pending;
            res.redirect(
                service.getLiveDataSourcesUrl(session.projectUuid, {
                    pickGoogleSource: true,
                }),
            );
            return;
        }
        res.redirect(
            service.getLiveDataSourcesUrl(session.projectUuid, {
                connectionUuid: result.connection.externalConnectionUuid,
            }),
        );
    } catch (e) {
        Logger.warn(
            `Google live-source sign-in failed for ${session.connector}: ${getErrorMessage(e)}`,
        );
        res.redirect(
            service.getLiveDataSourcesUrl(session.projectUuid, {
                error: getErrorMessage(e),
            }),
        );
    }
};
