import {
    ApiErrorPayload,
    ApiGroupResponse,
    ApiSuccessEmpty,
} from '@lightdash/common';
import { Controller, Delete, Put } from '@tsoa/runtime';
import express from 'express';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
} from 'tsoa';
import { groupService } from '../services/services';
import { isAuthenticated } from './authentication';

@Route('/api/v1/groups')
@Response<ApiErrorPayload>('default', 'Error')
export class GroupsController extends Controller {
    /**
     * Get group details including a list of members
     * @param groupUuid unique id of the group
     */
    @Middlewares([isAuthenticated])
    @Get('{groupUuid}')
    @OperationId('getGroup')
    async getGroup(
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGroupResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await groupService.get(req.user!, groupUuid),
        };
    }

    /**
     * Delete a group
     * @param unique id of the group to delete
     */
    @Middlewares([isAuthenticated])
    @Delete('{groupUuid}')
    @OperationId('deleteGroup')
    async deleteGroup(
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await groupService.delete(req.user!, groupUuid);
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
    @Middlewares([isAuthenticated])
    @Put('{groupUuid}/members/{userUuid}')
    @OperationId('addUserToGroup')
    async addUserToGroup(
        @Path() groupUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        const createdMember = await groupService.addGroupMember(req.user!, {
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
    @Middlewares([isAuthenticated])
    @Delete('{groupUuid}/members/{userUuid}')
    @OperationId('removeUserFromGroup')
    async removeUserFromGroup(
        @Path() groupUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        const deleted = await groupService.removeGroupMember(req.user!, {
            userUuid,
            groupUuid,
        });
        this.setStatus(deleted ? 200 : 204);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
