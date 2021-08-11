import express from 'express';
import { CreateInviteLink } from 'common';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { userService } from '../services/services';

export const inviteLinksRouter = express.Router();

inviteLinksRouter.post(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const createInviteLink = req.body as CreateInviteLink;
            const user = req.user!;
            const inviteLink = await userService.createOrganizationInviteLink(
                user,
                createInviteLink,
            );
            res.status(201).json({
                status: 'ok',
                results: inviteLink,
            });
        } catch (e) {
            next(e);
        }
    },
);
