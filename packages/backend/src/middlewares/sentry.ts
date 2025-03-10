/// <reference path="../@types/passport-openidconnect.d.ts" />
/// <reference path="../@types/express-session.d.ts" />
import { setTag, setTags } from '@sentry/node';
import { RequestHandler } from 'express';

export const sentrySetProjectUuidTagMiddleware: RequestHandler = (
    req,
    res,
    next,
) => {
    if (req.params?.projectUuid) {
        setTag('project.uuid', req.params.projectUuid);
    }

    if (req.user) {
        if (req.user.userUuid && typeof req.user.userUuid === 'string') {
            setTag('user.uuid', req.user.userUuid);
        }
        if (
            req.user.organizationUuid &&
            typeof req.user.organizationUuid === 'string'
        ) {
            setTag('organization.uuid', req.user.organizationUuid);
        }
    }
    next();
};
