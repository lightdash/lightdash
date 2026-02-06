import { OrganizationMemberRole } from '@lightdash/common';
import { NextFunction, Request, Response } from 'express';
import Logger from '../logging/logger';

/**
 * Middleware that replaces req.user with the impersonated user when an
 * impersonation session is active. Runs after passport.session() and
 * req.services are set, but before sessionAccountMiddleware builds
 * req.account.
 */
export async function impersonationMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
) {
    if (!req.session?.impersonation || !req.user) {
        next();
        return;
    }

    const {
        adminUserUuid,
        adminOrganizationUuid,
        targetUserUuid,
        targetOrganizationUuid,
    } = req.session.impersonation;

    try {
        const adminSessionUser = await req.services
            .getUserService()
            .findSessionUser({
                id: adminUserUuid,
                organization: adminOrganizationUuid,
            });

        // Admin authorization can change after impersonation starts, so we
        // enforce active admin status on every request.
        if (
            !adminSessionUser.isActive ||
            adminSessionUser.role !== OrganizationMemberRole.ADMIN
        ) {
            throw new Error(
                `Impersonation admin ${adminUserUuid} is no longer authorized`,
            );
        }

        const targetSessionUser = await req.services
            .getUserService()
            .findSessionUser({
                id: targetUserUuid,
                organization: targetOrganizationUuid,
            });

        if (
            !targetSessionUser.isActive ||
            targetSessionUser.organizationUuid !==
                adminSessionUser.organizationUuid
        ) {
            throw new Error(
                `Impersonation target ${targetUserUuid} is no longer valid`,
            );
        }

        // Replace the session user with the impersonated user
        req.user = targetSessionUser;
        // Clear req.account so sessionAccountMiddleware rebuilds it
        // from the new req.user
        delete req.account;
    } catch (error) {
        Logger.error(
            `Invalid impersonation session for admin ${adminUserUuid} and target ${targetUserUuid}, clearing impersonation`,
            error,
        );
        delete req.session.impersonation;
    }

    next();
}
