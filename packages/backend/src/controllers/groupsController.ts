import {
    ApiCreateProjectGroupAccess,
    ApiErrorPayload,
    ApiGroupMembersResponse,
    ApiGroupResponse,
    ApiSuccessEmpty,
    ApiUpdateProjectGroupAccess,
    UpdateGroupWithMembers,
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
    Put,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    CreateDBProjectGroupAccess,
    UpdateDBProjectGroupAccess,
} from '../database/entities/projectGroupAccess';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/groups')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('User Groups')
export class GroupsController extends BaseController {
    /**
     * Get group details
     * @param groupUuid unique id of the group
     * @param includeMembers number of members to include
     * @param offset offset of members to include
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('{groupUuid}')
    @OperationId('getGroup')
    async getGroup(
        @Path() groupUuid: string,
        @Request() req: express.Request,
        @Query() includeMembers?: number,
        @Query() offset?: number,
    ): Promise<ApiGroupResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGroupService()
                .get(req.user!, groupUuid, includeMembers, offset),
        };
    }

    /**
     * Delete a group
     * @param unique id of the group to delete
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('{groupUuid}')
    @OperationId('deleteGroup')
    async deleteGroup(
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services.getGroupService().delete(req.user!, groupUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Add a Lightdash user to a group
     * @param groupUuid the UUID for the group to add the user to
     * @param userUuid the UUID for the user to add to the group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('{groupUuid}/members/{userUuid}')
    @OperationId('addUserToGroup')
    async addUserToGroup(
        @Path() groupUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        const createdMember = await this.services
            .getGroupService()
            .addGroupMember(req.user!, {
                groupUuid,
                userUuid,
            });
        this.setStatus(createdMember === undefined ? 204 : 201);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove a user from a group
     * @param groupUuid the UUID for the group to remove the user from
     * @param userUuid the UUID for the user to remove from the group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('{groupUuid}/members/{userUuid}')
    @OperationId('removeUserFromGroup')
    async removeUserFromGroup(
        @Path() groupUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        const deleted = await this.services
            .getGroupService()
            .removeGroupMember(req.user!, {
                userUuid,
                groupUuid,
            });
        this.setStatus(deleted ? 200 : 204);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * View members of a group
     * @param groupUuid the UUID for the group to view the members of
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('{groupUuid}/members')
    @OperationId('getGroupMembers')
    async getGroupMembers(
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGroupMembersResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGroupService()
                .getGroupMembers(req.user!, groupUuid),
        };
    }

    /**
     * Update a group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('{groupUuid}')
    @OperationId('updateGroup')
    async updateGroup(
        @Path() groupUuid: string,
        @Request() req: express.Request,
        @Body() body: UpdateGroupWithMembers,
    ): Promise<ApiGroupResponse> {
        const group = await this.services
            .getGroupService()
            .update(req.user!, groupUuid, body);
        this.setStatus(200);
        return {
            status: 'ok',
            results: group,
        };
    }

    /**
     * Add project access to a group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('{groupUuid}/projects/{projectUuid}')
    @OperationId('addProjectAccessToGroup')
    async addProjectAccessToGroup(
        @Path() groupUuid: string,
        @Path() projectUuid: string,
        @Body() projectGroupAccess: Pick<CreateDBProjectGroupAccess, 'role'>,
        @Request() req: express.Request,
    ): Promise<ApiCreateProjectGroupAccess> {
        const results = await this.services
            .getGroupService()
            .addProjectAccess(req.user!, {
                groupUuid,
                projectUuid,
                role: projectGroupAccess.role,
            });
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Update project access for a group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('{groupUuid}/projects/{projectUuid}')
    @OperationId('updateProjectAccessForGroup')
    async updateProjectAccessForGroup(
        @Path() groupUuid: string,
        @Path() projectUuid: string,
        @Body()
        projectGroupAccess: UpdateDBProjectGroupAccess,
        @Request() req: express.Request,
    ): Promise<ApiUpdateProjectGroupAccess> {
        const results = await this.services
            .getGroupService()
            .updateProjectAccess(
                req.user!,
                { groupUuid, projectUuid },
                projectGroupAccess,
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Remove project access from a group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('{groupUuid}/projects/{projectUuid}')
    @OperationId('removeProjectAccessFromGroup')
    async removeProjectAccessFromGroup(
        @Path() groupUuid: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        const removed = await this.services
            .getGroupService()
            .removeProjectAccess(req.user!, {
                groupUuid,
                projectUuid,
            });
        this.setStatus(removed ? 200 : 204);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
