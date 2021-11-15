import { CreateInviteLink } from 'common';
import express from 'express';
import { userService } from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

export const inviteLinksRouter = express.Router();

inviteLinksRouter.get(
    '/:inviteLinkCode',
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const { inviteLinkCode } = req.params;
            const inviteLink = await userService.getInviteLink(inviteLinkCode);
            res.status(200).json({
                status: 'ok',
                results: inviteLink,
            });
        } catch (e) {
            next(e);
        }
    },
);

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

inviteLinksRouter.delete(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            await userService.revokeAllInviteLinks(req.user!);
            res.status(200).json({
                status: 'ok',
            });
        } catch (e) {
            next(e);
        }
    },
);
