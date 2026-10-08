import {
    assertRegisteredAccount,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    truncateForMessage,
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
import { validate as isUuid } from 'uuid';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type DepartmentService } from '../services/DepartmentService/DepartmentService';

// The overlap diagram shows at most three sets: the department and two others
const MAX_COMPARED_DEPARTMENTS = 2;

// Lower case, as the service compares uuids; a malformed one never reaches the database
const toUuid = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !isUuid(value)) {
        throw new ParameterError(
            `${label} must be a valid UUID: ${truncateForMessage(value)}`,
        );
    }
    return value.toLowerCase();
};

// Comma-separated department uuids; an empty value is the same as leaving it out
const toDepartmentList = (
    parameter: 'with' | 'without',
    value: string | undefined,
    departmentUuid: string,
): string[] | undefined => {
    if (value === undefined || value === '') return undefined;
    const entries = value.split(',');
    if (entries.length > MAX_COMPARED_DEPARTMENTS) {
        throw new ParameterError(
            `"${parameter}" can list at most ${MAX_COMPARED_DEPARTMENTS} departments`,
        );
    }
    const uuids = entries.map((entry) =>
        toUuid(entry, `Department in "${parameter}"`),
    );
    if (uuids.includes(departmentUuid)) {
        throw new ParameterError(
            `"${parameter}" cannot list the department itself`,
        );
    }
    return uuids;
};

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
        const validDepartmentUuid = toUuid(departmentUuid, 'Department');
        const withUuids = toDepartmentList(
            'with',
            withDepartmentUuids,
            validDepartmentUuid,
        );
        const withoutUuids = toDepartmentList(
            'without',
            withoutDepartmentUuids,
            validDepartmentUuid,
        );
        const results = await this.departmentService().getOverlaps(
            req.account,
            validDepartmentUuid,
            withUuids,
            withoutUuids,
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
        const validUserUuid = toUuid(userUuid, 'User');
        const validDepartmentUuid =
            body.departmentUuid === null
                ? null
                : toUuid(body.departmentUuid, 'Department');
        await this.departmentService().setPrimaryDepartment(
            req.account,
            validUserUuid,
            { departmentUuid: validDepartmentUuid },
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
