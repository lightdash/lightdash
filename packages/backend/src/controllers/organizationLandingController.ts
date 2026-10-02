import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiOrganizationJoinRequestResponse,
    type ApiOrganizationJoinRequestsResponse,
    type ApiOrganizationLandingResponse,
    type ApiSuccessEmpty,
    type ApproveOrganizationJoinRequest,
    type CreateOrganizationJoinRequest,
} from '@lightdash/common';
import {
    Body,
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

@Route('/api/v1')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationLandingController extends BaseController {
    /**
     * The ways the current user can land in an organization: organizations
     * they can join, organizations they can ask to join, and whether they can
     * create one.
     * @summary Get organization landing options
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/user/me/organization-landing')
    @OperationId('getOrganizationLanding')
    async getOrganizationLanding(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationLandingResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationLandingService()
                .getLanding(toSessionUser(req.account)),
        };
    }

    /**
     * Ask the admins of an organization to let the current user join.
     * @summary Request to join an organization
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/user/me/organization-join-requests')
    @OperationId('createOrganizationJoinRequest')
    async createJoinRequest(
        @Request() req: express.Request,
        @Body() body: CreateOrganizationJoinRequest,
    ): Promise<ApiOrganizationJoinRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationLandingService()
                .requestToJoin(
                    toSessionUser(req.account),
                    body.organizationUuid,
                ),
        };
    }

    /**
     * Open requests to join the current organization.
     * @summary List requests to join
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/org/join-requests')
    @OperationId('listOrganizationJoinRequests')
    async listJoinRequests(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationJoinRequestsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationLandingService()
                .listJoinRequests(req.account),
        };
    }

    /**
     * Approve a request to join and add the person with the given role.
     * @summary Approve a request to join
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/org/join-requests/{joinRequestUuid}/approve')
    @OperationId('approveOrganizationJoinRequest')
    async approveJoinRequest(
        @Request() req: express.Request,
        @Path() joinRequestUuid: string,
        @Body() body: ApproveOrganizationJoinRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationLandingService()
            .approveJoinRequest(req.account, joinRequestUuid, body.role);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Decline a request to join.
     * @summary Decline a request to join
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/org/join-requests/{joinRequestUuid}/decline')
    @OperationId('declineOrganizationJoinRequest')
    async declineJoinRequest(
        @Request() req: express.Request,
        @Path() joinRequestUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationLandingService()
            .declineJoinRequest(req.account, joinRequestUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
