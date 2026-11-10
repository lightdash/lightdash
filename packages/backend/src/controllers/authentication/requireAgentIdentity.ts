import { ForbiddenError } from '@lightdash/common';
import { type RequestHandler } from 'express';

export const requireAgentIdentity: RequestHandler = async (req, _res, next) => {
    try {
        const { user } = req;
        if (!user?.organizationUuid) {
            throw new ForbiddenError('An organization sign-in is required');
        }
        await req.services.getAiAccessService().assertFeatureEnabled({
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        });
        next();
    } catch (error) {
        next(error);
    }
};
