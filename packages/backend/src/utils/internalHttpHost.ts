import { type Request } from 'express';

/**
 * True when the request reached the configured internal Lightdash host over
 * plain http, e.g. the headless browser calling an in-cluster service.
 */
export const isPlainHttpInternalHostRequest = (
    req: Pick<Request, 'secure' | 'headers'>,
    internalLightdashHost: string,
): boolean => {
    let internalUrl: URL;
    try {
        internalUrl = new URL(internalLightdashHost);
    } catch {
        return false;
    }
    return (
        internalUrl.protocol === 'http:' &&
        !req.secure &&
        req.headers.host?.toLowerCase() === internalUrl.host
    );
};
