import { CreateInviteLink } from '@lightdash/common';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const inviteLinksRouter = express.Router();

inviteLinksRouter.get(
    '/:inviteLinkCode',
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const { inviteLinkCode } = req.params;
            const inviteLink = await req.services
                .getUserService()
                .getInviteLink(inviteLinkCode);
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
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const createInviteLink = req.body as CreateInviteLink;
            const user = req.user!;
            const inviteLink = await req.services
                .getUserService()
                .createPendingUserAndInviteLink(user, createInviteLink);
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
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            await req.services.getUserService().revokeAllInviteLinks(req.user!);
            res.status(200).json({
                status: 'ok',
            });
        } catch (e) {
            next(e);
        }
    },
);
