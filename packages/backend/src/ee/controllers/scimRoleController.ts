import {
    ScimErrorPayload,
    ScimListResponse,
    ScimRole,
} from '@lightdash/common';
import {
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
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimRoles')
    @Response<ScimListResponse<ScimRole>>('200', 'Success')
    async getScimRoles(
        @Request() req: express.Request,
        @Query() filter?: string,
    ): Promise<ScimListResponse<ScimRole>> {
        const organizationUuid = req.serviceAccount?.organizationUuid as string;
        return this.getScimService().listRoles({
            organizationUuid,
            filter,
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
