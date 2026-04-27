import type { AccountRequestContext } from '@lightdash/common';
import type { Request } from 'express';

const headerToString = (
    value: string | string[] | undefined,
): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
};

export const requestContextFromExpress = (
    req: Request,
): AccountRequestContext => ({
    ip: req.ip,
    userAgent: headerToString(req.headers['user-agent']),
    requestId:
        headerToString(req.headers['x-request-id']) ??
        headerToString(req.headers['x-amzn-trace-id']),
});
