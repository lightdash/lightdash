import {
    AddSpaceGroupAccess,
    AddSpaceUserAccess,
    ApiErrorPayload,
    ApiSpaceDeleteImpactResponse,
    ApiSpaceResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    CreateSpace,
    UpdateSpace,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
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

@Route('/api/v1/projects/{projectUuid}/spaces')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Spaces')
export class SpaceController extends BaseController {
    /**
     * Get details for a space in a project
     * @summary Get space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to get
     * @param req
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{spaceUuid}')
    @OperationId('GetSpace')
    async getSpace(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getSpaceService()
            .getSpace(projectUuid, toSessionUser(req.account), spaceUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get the impact of deleting a space (affected child spaces, charts, dashboards)
     * @summary Get delete impact
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to check
     * @param req
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{spaceUuid}/delete-impact')
    @OperationId('GetSpaceDeleteImpact')
    async getDeleteImpact(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceDeleteImpactResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSpaceService()
                .getDeleteImpact(toSessionUser(req.account), spaceUuid),
        };
    }

    /**
     * Create a new space inside a project
     * @summary Create space
     * @param projectUuid The uuid of the space's parent project
     * @param body
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Created')
    @Post('/')
    @OperationId('CreateSpaceInProject')
    @Tags('Roles & Permissions')
    async createSpace(
        @Path() projectUuid: string,
        @Body() body: CreateSpace,
        @Request() req: express.Request,
    ): Promise<ApiSpaceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getSpaceService()
            .createSpace(projectUuid, toSessionUser(req.account), body);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Delete a space from a project
     * @summary Delete space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to delete
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('204', 'Deleted')
    @Delete('{spaceUuid}')
    @OperationId('DeleteSpace')
    async deleteSpace(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSpaceService()
            .delete(toSessionUser(req.account), spaceUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update a space in a project
     * @summary Update space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to update
     * @param body
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated')
    @Patch('{spaceUuid}')
    @OperationId('UpdateSpace')
    @Tags('Roles & Permissions')
    async updateSpace(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Body() body: UpdateSpace,
        @Request() req: express.Request,
    ): Promise<ApiSpaceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getSpaceService()
            .updateSpace(toSessionUser(req.account), spaceUuid, body);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Grant a user access to a space
     * @summary Grant user access to space
     * @param projectUuid The uuid of the space's parent project
     * @parmm spaceUuid The uuid of the space to update
     * @param userUuid The uuid of the user to grant access to
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{spaceUuid}/share')
    @OperationId('AddSpaceUserAccess')
    @Tags('Roles & Permissions')
    async addSpaceUserAccess(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Body() body: AddSpaceUserAccess,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSpaceService()
            .addSpaceUserAccess(
                toSessionUser(req.account),
                spaceUuid,
                body.userUuid,
                body.spaceRole,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove a user's access to a space
     * @summary Revoke user access to space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to update
     * @param userUuid The uuid of the user to revoke access from
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('{spaceUuid}/share/{userUuid}')
    @OperationId('RevokeSpaceAccessForUser')
    @Tags('Roles & Permissions')
    async revokeSpaceAccessForUser(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSpaceService()
            .removeSpaceUserAccess(
                toSessionUser(req.account),
                spaceUuid,
                userUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Grant a group access to a space
     * @summary Grant group access to space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to update
     * @param groupUuid The uuid of the group to grant access to
     * @param spaceRole The role for the group in the space
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{spaceUuid}/group/share')
    @OperationId('AddSpaceGroupAccess')
    @Tags('Roles & Permissions')
    async addSpaceGroupAccess(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Body() body: AddSpaceGroupAccess,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSpaceService()
            .addSpaceGroupAccess(
                toSessionUser(req.account),
                spaceUuid,
                body.groupUuid,
                body.spaceRole,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove a group's access to a space
     * @summary Revoke group access to space
     * @param projectUuid The uuid of the space's parent project
     * @param spaceUuid The uuid of the space to update
     * @param groupUuid The uuid of the group to revoke access from
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('{spaceUuid}/group/share/{groupUuid}')
    @OperationId('RevokeGroupSpaceAccess')
    @Tags('Roles & Permissions')
    async revokeGroupSpaceAccess(
        @Path() projectUuid: string,
        @Path() spaceUuid: string,
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSpaceService()
            .removeSpaceGroupAccess(
                toSessionUser(req.account),
                spaceUuid,
                groupUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
