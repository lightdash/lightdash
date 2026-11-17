import { LightdashRequestMethodHeader, RequestMethod } from '@lightdash/common';
import { type Request, type RequestHandler } from 'express';
import helmet, { type HelmetOptions } from 'helmet';

type InternalHostRequest = Pick<Request, 'headers' | 'socket'>;

const firstHeaderValue = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();

// Express never enables 'trust proxy', so req.secure is false behind a TLS
// terminating proxy. A forwarded https protocol only ever narrows the match.
const isServedOverHttps = (req: InternalHostRequest): boolean =>
    ('encrypted' in req.socket && req.socket.encrypted === true) ||
    firstHeaderValue(req.headers['x-forwarded-proto'])?.toLowerCase() ===
        'https';

/**
 * True when the headless browser reached the configured internal Lightdash
 * host over plain http, e.g. through an in-cluster service.
 */
export const isPlainHttpInternalHostRequest = (
    req: InternalHostRequest,
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
        req.headers.host?.toLowerCase() === internalUrl.host &&
        firstHeaderValue(
            req.headers[LightdashRequestMethodHeader.toLowerCase()],
        ) === RequestMethod.HEADLESS_BROWSER &&
        !isServedOverHttps(req)
    );
};

/**
 * Helmet, minus upgrade-insecure-requests for the headless browser on a plain
 * http internal host: the directive rewrites every subresource to https, which
 * that host can't serve.
 */
export const helmetForInternalHttpHost = (
    config: HelmetOptions,
    internalLightdashHost: string,
): RequestHandler => {
    const standard = helmet(config);
    const csp = config.contentSecurityPolicy;
    const cspOptions = typeof csp === 'object' ? csp : {};
    const internalHttp =
        csp === false
            ? standard
            : helmet({
                  ...config,
                  contentSecurityPolicy: {
                      ...cspOptions,
                      directives: {
                          ...cspOptions.directives,
                          'upgrade-insecure-requests': null,
                      },
                  },
              });
    // Single return: the OAuth route inventory resolves middleware factories statically.
    return (req, res, next) =>
        isPlainHttpInternalHostRequest(req, internalLightdashHost)
            ? internalHttp(req, res, next)
            : standard(req, res, next);
};
