import {
    assertRegisteredAccount,
    type ApiDirectAccessAssignmentsResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type DirectAccessPrincipalType,
    type DirectAccessResourceType,
    type UpsertDirectAccessAssignmentRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/direct-access')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Direct Access')
export class DirectAccessController extends BaseController {
    /**
     * List the direct access assignments stored for one resource. Returns
     * direct assignments and direct roles only; inherited or effective roles
     * are never reconstructed here.
     * @summary List direct access
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{resourceType}/{resourceUuid}/assignments')
    @OperationId('List direct access assignments')
    async listDirectAccessAssignments(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: UUID,
    ): Promise<ApiDirectAccessAssignmentsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDirectAccessService()
                .listAssignments(
                    req.account,
                    projectUuid,
                    resourceType,
                    resourceUuid,
                ),
        };
    }

    /**
     * Create or replace one principal's direct role on a resource.
     * @summary Replace direct access role
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put(
        '{resourceType}/{resourceUuid}/assignments/{principalType}/{principalUuid}',
    )
    @OperationId('Replace direct access role')
    async upsertDirectAccessAssignment(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: UUID,
        @Path() principalType: DirectAccessPrincipalType,
        @Path() principalUuid: UUID,
        @Body() body: UpsertDirectAccessAssignmentRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getDirectAccessService()
            .upsertAssignment(
                req.account,
                projectUuid,
                resourceType,
                resourceUuid,
                { type: principalType, uuid: principalUuid },
                body.role,
            );
        return { status: 'ok', results: undefined };
    }

    /**
     * Revoke one principal's direct access. Revoking an assignment that does
     * not exist succeeds as a no-op.
     * @summary Revoke direct access
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete(
        '{resourceType}/{resourceUuid}/assignments/{principalType}/{principalUuid}',
    )
    @OperationId('Revoke direct access')
    async revokeDirectAccessAssignment(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: UUID,
        @Path() principalType: DirectAccessPrincipalType,
        @Path() principalUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getDirectAccessService()
            .revokeAssignment(
                req.account,
                projectUuid,
                resourceType,
                resourceUuid,
                { type: principalType, uuid: principalUuid },
            );
        return { status: 'ok', results: undefined };
    }

    /**
     * Remove every direct access assignment from one resource.
     * @summary Reset direct access
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('{resourceType}/{resourceUuid}/assignments')
    @OperationId('Reset direct access')
    async resetDirectAccessAssignments(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getDirectAccessService()
            .resetAssignments(
                req.account,
                projectUuid,
                resourceType,
                resourceUuid,
            );
        return { status: 'ok', results: undefined };
    }
}
