import { subject } from '@casl/ability';
import {
    ApiErrorPayload,
    CreateInviteLink,
    ForbiddenError,
    InviteLink,
    SessionUser,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/invite-links')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class InviteLinksController extends BaseController {
    /**
     * Get invite link details
     * @param inviteLinkCode the code for the invite link
     * @param req express request
     */
    @Middlewares([unauthorisedInDemo])
    @Get('/{inviteLinkCode}')
    @OperationId('GetInviteLink')
    async getInviteLink(
        @Path() inviteLinkCode: string,
        @Request() req: express.Request & { user?: SessionUser },
    ): Promise<{
        status: 'ok';
        results: InviteLink;
    }> {
        const inviteLink = await this.services
            .getUserService()
            .getInviteLink(inviteLinkCode);

        if (
            req.user &&
            req.user.ability.cannot(
                'view',
                subject('InviteLink', {
                    organizationUuid: req.user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return {
            status: 'ok',
            results: inviteLink,
        };
    }

    /**
     * Create a new invite link
     * @param req express request
     * @param body invite link creation details
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/')
    @OperationId('CreateInviteLink')
    async createInviteLink(
        @Request() req: express.Request & { user: SessionUser },
        @Body() body: CreateInviteLink,
    ): Promise<{
        status: 'ok';
        results: InviteLink;
    }> {
        if (
            req.user.ability.cannot(
                'create',
                subject('InviteLink', {
                    organizationUuid: req.user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const inviteLink = await this.services
            .getUserService()
            .createPendingUserAndInviteLink(req.user, body);

        return {
            status: 'ok',
            results: inviteLink,
        };
    }

    /**
     * Revoke all invite links for the authenticated user
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/')
    @OperationId('RevokeAllInviteLinks')
    async revokeAllInviteLinks(
        @Request() req: express.Request & { user: SessionUser },
    ): Promise<{
        status: 'ok';
        results: undefined;
    }> {
        if (
            req.user.ability.cannot(
                'delete',
                subject('InviteLink', {
                    organizationUuid: req.user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.services.getUserService().revokeAllInviteLinks(req.user);

        return {
            status: 'ok',
            results: undefined,
        };
    }
}
