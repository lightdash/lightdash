import type { RequestHandler } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestFeatureFlags = new AsyncLocalStorage<{
    active: boolean;
}>();

export const featureFlagRequestMiddleware: RequestHandler = (
    _req,
    res,
    next,
) => {
    const request = { active: true };
    const complete = () => {
        request.active = false;
    };
    res.once('finish', complete);
    res.once('close', complete);
    requestFeatureFlags.run(request, next);
};
