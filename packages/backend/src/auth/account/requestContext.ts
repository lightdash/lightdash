import {
    LightdashCliVersionHeader,
    type AccountRequestContext,
} from '@lightdash/common';
import type { Request } from 'express';

const headerToString = (
    value: string | string[] | undefined,
): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const validatedCliVersion = (value: string | undefined): string | null =>
    value !== undefined &&
    value.length <= 32 &&
    value.trim() === value &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/.test(
        value,
    )
        ? value
        : null;

const normalizedUserAgent = (value: string | undefined): string | undefined =>
    value
        ?.replace(/\p{Cc}/gu, '')
        .replace(
            /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+/g,
            '[redacted]',
        )
        .slice(0, 256);

export const requestContextFromExpress = (
    req: Request,
): AccountRequestContext => ({
    cliVersion: validatedCliVersion(
        headerToString(req.headers[LightdashCliVersionHeader.toLowerCase()]),
    ),
    ip: req.ip,
    userAgent: normalizedUserAgent(headerToString(req.headers['user-agent'])),
    requestId:
        headerToString(req.headers['x-request-id']) ??
        headerToString(req.headers['x-amzn-trace-id']),
});
