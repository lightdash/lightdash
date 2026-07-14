import {
    ApiErrorPayload,
    ApiInviteLinkResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    CreateInviteLink,
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
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
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
     * Get an invite link by its code. Public endpoint used by the invite
     * acceptance page.
     * @summary Get invite link
     * @param inviteLinkCode the code of the invite link
     */
    @Middlewares([unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('{inviteLinkCode}')
    @OperationId('GetInviteLink')
    async getInviteLink(
        @Path() inviteLinkCode: string,
    ): Promise<ApiInviteLinkResponse> {
        const inviteLink = await this.services
            .getUserService()
            .getInviteLink(inviteLinkCode);
        this.setStatus(200);
        return {
            status: 'ok',
            results: inviteLink,
        };
    }

    /**
     * Invite a new user to the organization and create an invite link for
     * them. If the email already belongs to a pending user, a new invite
     * link is generated for them. Only available to organization admins.
     * @summary Create invite link
     * @param body the email, role and expiry of the invite.
     * expiresAt defaults to 3 days from now when omitted
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('CreateInviteLink')
    async createInviteLink(
        @Request() req: express.Request,
        @Body() body: CreateInviteLink,
    ): Promise<ApiInviteLinkResponse> {
        assertRegisteredAccount(req.account);
        const user = toSessionUser(req.account);
        const inviteLink = await this.services
            .getUserService()
            .createPendingUserAndInviteLink(user, body);
        this.setStatus(201);
        return {
            status: 'ok',
            results: inviteLink,
        };
    }

    /**
     * Revoke all invite links in the organization. Only available to
     * organization admins.
     * @summary Revoke all invite links
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('RevokeAllInviteLinks')
    async revokeAllInviteLinks(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        const user = toSessionUser(req.account);
        await this.services.getUserService().revokeAllInviteLinks(user);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
