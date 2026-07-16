import {
    parseCustomRoleAsCode,
    parseGroupAsCode,
    parseUserAsCode,
    type ApiCustomRoleAsCodeListResponse,
    type ApiCustomRoleAsCodeUpsertResponse,
    type ApiErrorPayload,
    type ApiGroupAsCodeListResponse,
    type ApiGroupAsCodeUpsertResponse,
    type ApiUserAsCodeListResponse,
    type ApiUserAsCodeUpsertResponse,
    type CustomRoleAsCode,
    type GroupAsCode,
    type UserAsCode,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../../controllers/baseController';
import {
    CODE_READ_MIDDLEWARES,
    CODE_WRITE_MIDDLEWARES,
    codeSuccess,
} from '../../controllers/CoderControllerUtils';

@Route('/api/v2/orgs/{orgUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class OrganizationCoderController extends BaseController {
    /**
     * Get custom roles in code representation
     * @summary List custom roles as code
     */
    @Tags('v2', 'Custom Roles')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/roles/code')
    @OperationId('GetCustomRolesAsCode')
    async getCustomRolesAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiCustomRoleAsCodeListResponse> {
        const customRoles = await this.services
            .getRolesService()
            .getCustomRolesAsCode(req.account!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ customRoles });
    }

    /**
     * Upsert a custom role from code representation
     * @summary Upsert custom role as code
     */
    @Tags('v2', 'Custom Roles')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/roles/code')
    @OperationId('UpsertCustomRoleAsCode')
    async upsertCustomRoleAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: CustomRoleAsCode,
    ): Promise<ApiCustomRoleAsCodeUpsertResponse> {
        const results = await this.services
            .getRolesService()
            .upsertCustomRoleAsCode(
                req.account!,
                orgUuid,
                parseCustomRoleAsCode(body, 'request body'),
            );
        this.setStatus(200);
        return codeSuccess(results);
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/users/code')
    @OperationId('GetOrganizationUsersAsCode')
    async getUsersAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiUserAsCodeListResponse> {
        const users = await this.services
            .getRolesService()
            .getUsersAsCode(req.account!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ users });
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/users/code')
    @OperationId('UpsertOrganizationUserAsCode')
    async upsertUserAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: UserAsCode,
        @Query() sendInvite: boolean = false,
    ): Promise<ApiUserAsCodeUpsertResponse> {
        const results = await this.services
            .getRolesService()
            .upsertUserAsCode(
                req.account!,
                orgUuid,
                parseUserAsCode(body, 'request body'),
                sendInvite,
            );
        this.setStatus(200);
        return codeSuccess(results);
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/groups/code')
    @OperationId('GetOrganizationGroupsAsCode')
    async getGroupsAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiGroupAsCodeListResponse> {
        const groups = await this.services
            .getGroupService()
            .getGroupsAsCode(req.account!, orgUuid);
        this.setStatus(200);
        return codeSuccess({ groups });
    }

    @Tags('v2', 'Organizations')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/groups/code')
    @OperationId('UpsertOrganizationGroupAsCode')
    async upsertGroupAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: GroupAsCode,
    ): Promise<ApiGroupAsCodeUpsertResponse> {
        const results = await this.services
            .getGroupService()
            .upsertGroupAsCode(
                req.account!,
                orgUuid,
                parseGroupAsCode(body, 'request body'),
            );
        this.setStatus(200);
        return codeSuccess(results);
    }
}
