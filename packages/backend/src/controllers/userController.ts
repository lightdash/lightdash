import { RequestHandler } from 'express';
import { userService } from '../services/services';

export const getUserIdentities: RequestHandler = async (req, res, next) => {
    const identities = await userService.getLinkedIdentities(req.user!);
    res.json({
        status: 'ok',
        results: identities,
    });
};
