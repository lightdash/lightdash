import { CreateInviteLink } from '@lightdash/common';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { userService } from '../services/services';

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
        } catch (e: any) {
            next(e);
        }
    },
);

inviteLinksRouter.post(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const createInviteLink = req.body as CreateInviteLink;
            const user = req.user!;
            const inviteLink = await userService.createPendingUserAndInviteLink(
                user,
                createInviteLink,
            );
            res.status(201).json({
                status: 'ok',
                results: inviteLink,
            });
        } catch (e: any) {
            next(e);
        }
    },
);

inviteLinksRouter.delete(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            await userService.revokeAllInviteLinks(req.user!);
            res.status(200).json({
                status: 'ok',
            });
        } catch (e: any) {
            next(e);
        }
    },
);
