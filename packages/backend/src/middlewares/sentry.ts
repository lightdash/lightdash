/// <reference path="../@types/passport-openidconnect.d.ts" />
/// <reference path="../@types/express-session.d.ts" />
import {
    LightdashRequestMethodHeader,
    LightdashSdkVersionHeader,
} from '@lightdash/common';
import { setTag, setTags } from '@sentry/node';
import { RequestHandler } from 'express';

export const sentrySetProjectUuidTagMiddleware: RequestHandler = (
    req,
    res,
    next,
) => {
    if (typeof req.params?.projectUuid === 'string') {
        setTag('project.uuid', req.params.projectUuid);
    }
    if (typeof req.params?.dashboardUuid === 'string') {
        setTag('dashboard.uuid', req.params.dashboardUuid);
    }

    const requestMethod = req.header(LightdashRequestMethodHeader);
    if (requestMethod) {
        setTag('lightdash.requestMethod', requestMethod);
    }

    const sdkVersion = req.header(LightdashSdkVersionHeader);
    if (sdkVersion) {
        setTag('lightdash.sdkVersion', sdkVersion);
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
