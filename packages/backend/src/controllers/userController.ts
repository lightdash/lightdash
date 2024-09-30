import {
    ApiEmailStatusResponse,
    ApiErrorPayload,
    ApiGetAuthenticatedUserResponse,
    ApiGetLoginOptionsResponse,
    ApiRegisterUserResponse,
    ApiSuccessEmpty,
    ApiUserAllowedOrganizationsResponse,
    LoginOptions,
    ParameterError,
    RegisterOrActivateUser,
    UpsertUserWarehouseCredentials,
    UserWarehouseCredentials,
    validatePassword,
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
import { UserModel } from '../models/UserModel';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/user')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
export class UserController extends BaseController {
    /**
     * Get authenticated user
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('GetAuthenticatedUser')
    async getAuthenticatedUser(
        @Request() req: express.Request,
    ): Promise<ApiGetAuthenticatedUserResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: UserModel.lightdashUserFromSession(req.user!),
        };
    }

    /**
     * Register user
     * @param req express request
     * @param body
     */
    @Middlewares([unauthorisedInDemo])
    @Post('/')
    @OperationId('RegisterUser')
    async registerUser(
        @Request() req: express.Request,
        @Body()
        body: RegisterOrActivateUser,
    ): Promise<ApiRegisterUserResponse> {
        if (!validatePassword(req.body.password)) {
            throw new ParameterError(
                'Password must contain at least 8 characters, 1 letter and 1 number or 1 special character',
            );
        }
        const sessionUser = await this.services
            .getUserService()
            .registerOrActivateUser(body);
        return new Promise((resolve, reject) => {
            req.login(sessionUser, (err) => {
                if (err) {
                    reject(err);
                }
                this.setStatus(200);
                resolve({
                    status: 'ok',
                    results: sessionUser,
                });
            });
        });
    }

    /**
     * Create a new one-time passcode for the current user's primary email.
     * The user will receive an email with the passcode.
     * @param req express request
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Put('/me/email/otp')
    @OperationId('CreateEmailOneTimePasscode')
    async createEmailOneTimePasscode(
        @Request() req: express.Request,
    ): Promise<ApiEmailStatusResponse> {
        const status = await this.services
            .getUserService()
            .sendOneTimePasscodeToPrimaryEmail(req.user!);
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * Get the verification status for the current user's primary email
     * @param req express request
     * @param passcode the one-time passcode sent to the user's primary email
     */
    @Middlewares([isAuthenticated])
    @Get('/me/email/status')
    @OperationId('GetEmailVerificationStatus')
    async getEmailVerificationStatus(
        @Request() req: express.Request,
        @Query() passcode?: string,
    ): Promise<ApiEmailStatusResponse> {
        // Throws 404 error if not found
        const status = await this.services
            .getUserService()
            .getPrimaryEmailStatus(req.user!, passcode);
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * List the organizations that the current user can join.
     * This is based on the user's primary email domain and the organization's allowed email domains.
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/me/allowedOrganizations')
    @OperationId('ListMyAvailableOrganizations')
    async getOrganizationsUserCanJoin(
        @Request() req: express.Request,
    ): Promise<ApiUserAllowedOrganizationsResponse> {
        const status = await this.services
            .getUserService()
            .getAllowedOrganizations(req.user!);
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * Add the current user to an organization that accepts users with a verified email domain.
     * This will fail if the organization email domain does not match the user's primary email domain.
     * @param req express request
     * @param organizationUuid the uuid of the organization to join
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/me/joinOrganization/{organizationUuid}')
    @OperationId('JoinOrganization')
    async joinOrganization(
        @Request() req: express.Request,
        @Path() organizationUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getUserService()
            .joinOrg(req.user!, organizationUuid);
        const sessionUser = await req.services
            .getUserService()
            .getSessionByUserUuid(req.user!.userUuid);
        await new Promise<void>((resolve, reject) => {
            req.login(sessionUser, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete user
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Delete('/me')
    @OperationId('DeleteMe')
    async deleteUser(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getUserService()
            .delete(req.user!, req.user!.userUuid);

        await new Promise<void>((resolve, reject) => {
            req.session.destroy((err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get user warehouse credentials
     */
    @Middlewares([isAuthenticated])
    @Get('/warehouseCredentials')
    @OperationId('getWarehouseCredentials')
    async getWarehouseCredentials(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials[];
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .getWarehouseCredentials(req.user!),
        };
    }

    /**
     * Create user warehouse credentials
     */
    @Middlewares([isAuthenticated])
    @Post('/warehouseCredentials')
    @OperationId('createWarehouseCredentials')
    async createWarehouseCredentials(
        @Request() req: express.Request,
        @Body() body: UpsertUserWarehouseCredentials,
    ): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .createWarehouseCredentials(req.user!, body),
        };
    }

    /**
     * Update user warehouse credentials
     */
    @Middlewares([isAuthenticated])
    @Patch('/warehouseCredentials/{uuid}')
    @OperationId('updateWarehouseCredentials')
    async updateWarehouseCredentials(
        @Request() req: express.Request,
        @Path() uuid: string,
        @Body() body: UpsertUserWarehouseCredentials,
    ): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .updateWarehouseCredentials(req.user!, uuid, body),
        };
    }

    /**
     * Delete user warehouse credentials
     */
    @Middlewares([isAuthenticated])
    @Delete('/warehouseCredentials/{uuid}')
    @OperationId('deleteWarehouseCredentials')
    async deleteWarehouseCredentials(
        @Request() req: express.Request,
        @Path() uuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getUserService()
            .deleteWarehouseCredentials(req.user!, uuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get login options
     */
    @Get('/login-options')
    @OperationId('getLoginOptions')
    async getLoginOptions(
        @Request() req: express.Request,
        @Query() email?: string,
    ): Promise<ApiGetLoginOptionsResponse> {
        const loginOptions = await this.services
            .getUserService()
            .getLoginOptions(email);
        this.setStatus(200);
        return {
            status: 'ok',
            results: loginOptions,
        };
    }
}
