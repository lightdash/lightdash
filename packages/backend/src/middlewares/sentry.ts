import { SessionUser } from '@lightdash/common';
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
        const user = req.user as SessionUser;
        setTags({
            'user.uuid': user.userUuid,
            'organization.uuid': user.organizationUuid,
        });
    }
    next();
};
