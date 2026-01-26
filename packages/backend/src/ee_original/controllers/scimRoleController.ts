import {
    ScimErrorPayload,
    ScimListResponse,
    ScimRole,
    ScimSchemaType,
} from '@lightdash/common';
import {
    Example,
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../../controllers/baseController';
import { isScimAuthenticated } from '../authentication';
import { ScimService } from '../services/ScimService/ScimService';

@Route('/api/v1/scim/v2/Roles')
@Tags('SCIM')
export class ScimRoleController extends BaseController {
    /**
     * Get a list of roles within an organization
     * @summary List roles
     * @param req express request
     * @param filter Filter to apply to the role list (optional)
     * @param startIndex SCIM 2.0 startIndex (1-based). Defaults to 1.
     * @param count SCIM 2.0 count (page size). Defaults to 100.
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimRoles')
    @Response<ScimListResponse<ScimRole>>('200', 'Success')
    @Example<ScimListResponse<ScimRole>>({
        schemas: [ScimSchemaType.LIST_RESPONSE],
        totalResults: 3,
        itemsPerPage: 3,
        startIndex: 1,
        Resources: [
            {
                schemas: [ScimSchemaType.ROLE],
                id: 'member',
                value: 'member',
                display: 'Member',
                type: 'Organization',
                supported: true,
                meta: {
                    resourceType: 'Role',
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Roles/member',
                },
            },
            {
                schemas: [ScimSchemaType.ROLE],
                id: '3675b69e-8324-4110-bdca-059031aa8da3:viewer',
                value: '3675b69e-8324-4110-bdca-059031aa8da3:viewer',
                display: 'Jaffle shop - Viewer',
                type: 'Project - Jaffle shop',
                supported: true,
                meta: {
                    resourceType: 'Role',
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Roles/3675b69e-8324-4110-bdca-059031aa8da3:viewer',
                },
            },
            {
                schemas: [ScimSchemaType.ROLE],
                id: '3675b69e-8324-4110-bdca-059031aa8da3:da116e0f-2b96-4af4-93b7-b2636a26853d',
                value: '3675b69e-8324-4110-bdca-059031aa8da3:da116e0f-2b96-4af4-93b7-b2636a26853d',
                display: 'Jaffle shop - test',
                type: 'Project - Jaffle shop',
                supported: true,
                meta: {
                    resourceType: 'Role',
                    created: new Date('2025-11-03T17:01:45.447Z'),
                    lastModified: new Date('2025-11-03T17:01:45.447Z'),
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Roles/3675b69e-8324-4110-bdca-059031aa8da3:da116e0f-2b96-4af4-93b7-b2636a26853d',
                },
            },
        ],
    })
    async getScimRoles(
        @Request() req: express.Request,
        @Query() filter?: string,
        @Query() startIndex?: number,
        @Query() count?: number,
    ): Promise<ScimListResponse<ScimRole>> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().listRoles({
            organizationUuid,
            filter,
            startIndex,
            itemsPerPage: count,
        });
    }

    /**
     * Get a SCIM role by ID
     * @summary Get role
     * @param req express request
     * @param roleId Role ID - this is used as a unique identifier for SCIM
     */
    @Middlewares([isScimAuthenticated])
    @Get('/{roleId}')
    @OperationId('GetScimRole')
    @Response<ScimRole>('200', 'Success')
    @Response<ScimErrorPayload>('404', 'Not found')
    @Example<ScimRole>({
        schemas: [ScimSchemaType.ROLE],
        id: 'member',
        value: 'member',
        display: 'Member',
        type: 'Organization',
        supported: true,
        meta: {
            resourceType: 'Role',
            location:
                'https://<tenant>.lightdash.cloud/api/v1/scim/v2/Roles/member',
        },
    })
    async getScimRole(
        @Request() req: express.Request,
        @Path() roleId: string,
    ): Promise<ScimRole> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().getRole(organizationUuid, roleId);
    }

    // Convenience method to access the SCIM service
    protected getScimService() {
        return this.services.getScimService<ScimService>();
    }
}
