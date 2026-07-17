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
    @Get('/code/roles')
    @OperationId('GetCodeCustomRoles')
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
    @Post('/code/roles')
    @OperationId('UpsertCodeCustomRole')
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
    @Get('/code/users')
    @OperationId('GetCodeOrganizationUsers')
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
    @Post('/code/users')
    @OperationId('UpsertCodeOrganizationUser')
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
    @Get('/code/groups')
    @OperationId('GetCodeOrganizationGroups')
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
    @Post('/code/groups')
    @OperationId('UpsertCodeOrganizationGroup')
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

    /**
     * @summary List custom roles as code (deprecated)
     * @deprecated Use GET /code/roles. Remove after 2026-08-17.
     */
    @Tags('v2', 'Custom Roles')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/roles/code')
    @OperationId('GetCustomRolesAsCode')
    async legacyGetCustomRolesAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiCustomRoleAsCodeListResponse> {
        return this.getCustomRolesAsCode(req, orgUuid);
    }

    /**
     * @summary Upsert custom role as code (deprecated)
     * @deprecated Use POST /code/roles. Remove after 2026-08-17.
     */
    @Tags('v2', 'Custom Roles')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/roles/code')
    @OperationId('UpsertCustomRoleAsCode')
    async legacyUpsertCustomRoleAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: CustomRoleAsCode,
    ): Promise<ApiCustomRoleAsCodeUpsertResponse> {
        return this.upsertCustomRoleAsCode(req, orgUuid, body);
    }

    /**
     * @summary List organization users as code (deprecated)
     * @deprecated Use GET /code/users. Remove after 2026-08-17.
     */
    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/users/code')
    @OperationId('GetOrganizationUsersAsCode')
    async legacyGetUsersAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiUserAsCodeListResponse> {
        return this.getUsersAsCode(req, orgUuid);
    }

    /**
     * @summary Upsert organization user as code (deprecated)
     * @deprecated Use POST /code/users. Remove after 2026-08-17.
     */
    @Tags('v2', 'Organizations')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/users/code')
    @OperationId('UpsertOrganizationUserAsCode')
    async legacyUpsertUserAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: UserAsCode,
        @Query() sendInvite: boolean = false,
    ): Promise<ApiUserAsCodeUpsertResponse> {
        return this.upsertUserAsCode(req, orgUuid, body, sendInvite);
    }

    /**
     * @summary List organization groups as code (deprecated)
     * @deprecated Use GET /code/groups. Remove after 2026-08-17.
     */
    @Tags('v2', 'Organizations')
    @Middlewares(CODE_READ_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Get('/groups/code')
    @OperationId('GetOrganizationGroupsAsCode')
    async legacyGetGroupsAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiGroupAsCodeListResponse> {
        return this.getGroupsAsCode(req, orgUuid);
    }

    /**
     * @summary Upsert organization group as code (deprecated)
     * @deprecated Use POST /code/groups. Remove after 2026-08-17.
     */
    @Tags('v2', 'Organizations')
    @Middlewares(CODE_WRITE_MIDDLEWARES)
    @SuccessResponse('200', 'Success')
    @Post('/groups/code')
    @OperationId('UpsertOrganizationGroupAsCode')
    async legacyUpsertGroupAsCode(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: GroupAsCode,
    ): Promise<ApiGroupAsCodeUpsertResponse> {
        return this.upsertGroupAsCode(req, orgUuid, body);
    }
}
