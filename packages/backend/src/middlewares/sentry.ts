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
        setTags({
            'user.uuid': req.user.userUuid,
            'organization.uuid': req.user.organizationUuid,
        });
    }
    next();
};
