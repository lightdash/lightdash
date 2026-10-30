const rawBodies = new WeakMap<object, Buffer>();

// Express/Sentry re-normalize req.body on errors; keep attachment bytes out of downstream middleware.
export const keepRawThreadFileBodyPrivate = (
    request: { body: unknown },
    _response: unknown,
    next: () => void,
) => {
    if (Buffer.isBuffer(request.body)) {
        rawBodies.set(request, request.body);
        request.body = undefined;
    }
    next();
};

export const getRawThreadFileBody = (request: object) => rawBodies.get(request);
