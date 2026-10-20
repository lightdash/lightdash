import {
    assertRegisteredAccount,
    MissingConfigError,
    NotFoundError,
    parseOverlapList,
    parseUuid,
    type ApiDepartmentDetailResponse,
    type ApiDepartmentMembershipResponse,
    type ApiDepartmentOverlapsResponse,
    type ApiDepartmentResponse,
    type ApiErrorPayload,
    type ApiOrganizationAdoptionSummaryResponse,
    type ApiSuccessEmpty,
    type CreateDepartment,
    type SetDepartmentGroups,
    type SetDepartmentMembers,
    type SetDepartmentOwners,
    type SetPrimaryDepartment,
    type UpdateDepartment,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
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
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type DepartmentService } from '../services/DepartmentService/DepartmentService';

// Comma-separated; an empty value is the same as leaving it out
const splitQueryList = (value: string | undefined): string[] | undefined =>
    value === undefined || value === '' ? undefined : value.split(',');

@Route('/api/v1/org/departments')
// Under development: hidden until the feature is generally available
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgDepartmentsController extends BaseController {
    // No licence means no provider; that reads as "not found", not a config error
    protected departmentService(): DepartmentService {
        try {
            return this.services.getDepartmentService<DepartmentService>();
        } catch (e) {
            if (e instanceof MissingConfigError) {
                throw new NotFoundError('Not found');
            }
            throw e;
        }
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getOrganizationAdoptionSummary')
    async getSummary(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAdoptionSummaryResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().getSummary(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/membership')
    @OperationId('getDepartmentMembership')
    async getMembership(
        @Request() req: express.Request,
    ): Promise<ApiDepartmentMembershipResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().getMembership(
            req.account,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createDepartment')
    async create(
        @Request() req: express.Request,
        @Body() body: CreateDepartment,
    ): Promise<ApiDepartmentResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().create(
            req.account,
            body,
        );
        this.setStatus(201);
        return { status: 'ok', results };
    }

    // Add any GET /{departmentUuid} routes below this line, after /membership

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{departmentUuid}')
    @OperationId('getDepartmentDetail')
    async getDetail(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
    ): Promise<ApiDepartmentDetailResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().getDetail(
            req.account,
            departmentUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{departmentUuid}/overlaps')
    @OperationId('getDepartmentOverlaps')
    async getOverlaps(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
        @Query('with') withDepartmentUuids?: string,
        @Query('without') withoutDepartmentUuids?: string,
    ): Promise<ApiDepartmentOverlapsResponse> {
        assertRegisteredAccount(req.account);
        const validDepartmentUuid = parseUuid(departmentUuid, 'Department');
        const withUuids = parseOverlapList(
            'with',
            splitQueryList(withDepartmentUuids),
            validDepartmentUuid,
        );
        const withoutUuids = parseOverlapList(
            'without',
            splitQueryList(withoutDepartmentUuids),
            validDepartmentUuid,
        );
        const results = await this.departmentService().getOverlaps(
            req.account,
            validDepartmentUuid,
            withUuids ?? undefined,
            withoutUuids ?? undefined,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{departmentUuid}')
    @OperationId('updateDepartment')
    async update(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
        @Body() body: UpdateDepartment,
    ): Promise<ApiDepartmentResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().update(
            req.account,
            departmentUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{departmentUuid}')
    @OperationId('deleteDepartment')
    async delete(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.departmentService().delete(req.account, departmentUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/{departmentUuid}/groups')
    @OperationId('setDepartmentGroups')
    async setGroups(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
        @Body() body: SetDepartmentGroups,
    ): Promise<ApiDepartmentResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().setGroups(
            req.account,
            departmentUuid,
            body.groupUuids,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/{departmentUuid}/members')
    @OperationId('setDepartmentMembers')
    async setMembers(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
        @Body() body: SetDepartmentMembers,
    ): Promise<ApiDepartmentResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().setMembers(
            req.account,
            departmentUuid,
            body.userUuids,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/{departmentUuid}/owners')
    @OperationId('setDepartmentOwners')
    async setOwners(
        @Request() req: express.Request,
        @Path() departmentUuid: UUID,
        @Body() body: SetDepartmentOwners,
    ): Promise<ApiDepartmentResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.departmentService().setOwners(
            req.account,
            departmentUuid,
            body.owners,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/people/{userUuid}/primary')
    @OperationId('setPrimaryDepartment')
    async setPrimaryDepartment(
        @Request() req: express.Request,
        @Path() userUuid: UUID,
        @Body() body: SetPrimaryDepartment,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        const validUserUuid = parseUuid(userUuid, 'User');
        const validDepartmentUuid =
            body.departmentUuid === null
                ? null
                : parseUuid(body.departmentUuid, 'Department');
        await this.departmentService().setPrimaryDepartment(
            req.account,
            validUserUuid,
            { departmentUuid: validDepartmentUuid },
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
