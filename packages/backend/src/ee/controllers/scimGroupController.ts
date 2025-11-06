import {
    ScimErrorPayload,
    ScimGroup,
    ScimListResponse,
    ScimSchemaType,
    ScimUpsertGroup,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Example,
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
import { ScimPatch } from 'scim-patch';
import { BaseController } from '../../controllers/baseController';
import { isScimAuthenticated } from '../authentication';
import { ScimService } from '../services/ScimService/ScimService';

@Route('/api/v1/scim/v2/Groups')
@Tags('SCIM')
export class ScimGroupController extends BaseController {
    // Convenience method to access the SCIM service
    protected getScimService() {
        return this.services.getScimService<ScimService>();
    }

    /**
     * Get a list of groups within an organization
     * @summary List groups
     * @param req express request
     * @param filter Filter to apply to the group list (optional)
     * @param startIndex Index of the first group to return (optional)
     * @param count Number of groups to return (optional)
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimGroups')
    @Response<ScimListResponse<ScimGroup>>('200', 'Success')
    @Example<ScimListResponse<ScimGroup>>({
        schemas: [ScimSchemaType.LIST_RESPONSE],
        totalResults: 1,
        itemsPerPage: 1,
        startIndex: 1,
        Resources: [
            {
                schemas: [ScimSchemaType.GROUP],
                id: '1456c265-f375-4d64-bd33-105c84ad9b5d',
                displayName: 'Org 1 Editor Group',
                members: [
                    {
                        value: '80fb8b59-d6b7-4ed6-b969-9849310f3e53',
                        display: 'demo2@lightdash.com',
                    },
                ],
                meta: {
                    resourceType: 'Group',
                    created: new Date('2025-11-03T14:22:24.067Z'),
                    lastModified: new Date('2025-11-03T14:22:24.067Z'),
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Groups/1456c265-f375-4d64-bd33-105c84ad9b5d',
                },
            },
        ],
    })
    async getScimGroups(
        @Request() req: express.Request,
        @Query() filter?: string,
        @Query() startIndex?: number,
        @Query() count?: number,
    ): Promise<ScimListResponse<ScimGroup>> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().listGroups({
            organizationUuid,
            filter,
            itemsPerPage: count,
            startIndex,
        });
    }

    /**
     * Get a specific group by its SCIM ID
     * @summary Get group
     * @param req express request
     * @param id SCIM ID of the group to retrieve
     */
    @Middlewares([isScimAuthenticated])
    @Get('{id}')
    @OperationId('GetScimGroup')
    @Response<ScimGroup>('200', 'Success')
    @Response<ScimErrorPayload>('404', 'Not found')
    @Example<ScimGroup>({
        schemas: [ScimSchemaType.GROUP],
        id: '1456c265-f375-4d64-bd33-105c84ad9b5d',
        displayName: 'Org 1 Editor Group',
        members: [
            {
                value: '80fb8b59-d6b7-4ed6-b969-9849310f3e53',
                display: 'demo2@lightdash.com',
            },
        ],
        meta: {
            resourceType: 'Group',
            created: new Date('2025-11-03T14:22:24.067Z'),
            lastModified: new Date('2025-11-03T14:22:24.067Z'),
            location:
                'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Groups/1456c265-f375-4d64-bd33-105c84ad9b5d',
        },
    })
    async getScimGroup(
        @Request() req: express.Request,
        @Path() id: string,
    ): Promise<ScimGroup> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().getGroup(organizationUuid, id);
    }

    /**
     * Create a new group in the SCIM application
     * @summary Create group
     * @param req express request
     * @param body Group to create
     */
    @Middlewares([isScimAuthenticated])
    @Response<ScimGroup>('201', 'Created')
    @Response<ScimErrorPayload>('400', 'Bad Request')
    @Response<ScimErrorPayload>('409', 'Conflict')
    @OperationId('CreateScimGroup')
    @Post('/')
    async createScimGroup(
        @Request() req: express.Request,
        @Body() body: ScimUpsertGroup,
    ): Promise<ScimGroup> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().createGroup(organizationUuid, body);
    }

    /**
     * Partially updates a group’s attributes (e.g., add or remove members).
     * @summary Patch group
     * @param req express request
     * @param id SCIM ID of the group to update
     * @param body Update operations to apply to the group
     */
    @Middlewares([isScimAuthenticated])
    @Response<ScimGroup>('204', 'Success')
    @Response<ScimErrorPayload>('400', 'Bad Request')
    @Response<ScimErrorPayload>('404', 'Not found')
    @OperationId('UpdateScimGroup')
    @Patch('{id}')
    async updateScimGroup(
        @Request() req: express.Request,
        @Path() id: string,
        @Body() body: ScimPatch,
    ): Promise<ScimGroup> {
        return this.getScimService().updateGroup(
            req.serviceAccount?.organizationUuid as string,
            id,
            body,
        );
    }

    /**
     * Update a group's attributes completely
     * @summary Replace group
     * @param req express request
     * @param id SCIM ID of the group to update
     * @param body Group to update
     */
    @Middlewares([isScimAuthenticated])
    @Response<ScimGroup>('204', 'Success')
    @Response<ScimErrorPayload>('400', 'Bad Request')
    @Response<ScimErrorPayload>('404', 'Not found')
    @OperationId('ReplaceScimGroup')
    @Put('{id}')
    async replaceScimGroup(
        @Request() req: express.Request,
        @Path() id: string,
        @Body() body: ScimUpsertGroup,
    ): Promise<ScimGroup> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().replaceGroup(organizationUuid, id, body);
    }

    /**
     * Delete a specific group by its SCIM ID
     * @summary Delete group
     * @param req express request
     * @param id SCIM ID of the group to delete
     */
    @Middlewares([isScimAuthenticated])
    @Response<ScimGroup>('204', 'No Content')
    @Response<ScimErrorPayload>('404', 'Not found')
    @OperationId('DeleteScimGroup')
    @Delete('{id}')
    async deleteScimGroup(
        @Request() req: express.Request,
        @Path() id: string,
    ): Promise<void> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        await this.getScimService().deleteGroup(organizationUuid, id);
        this.setStatus(204);
    }
}
