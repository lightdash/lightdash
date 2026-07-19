import {
    ApiEmailStatusResponse,
    ApiErrorPayload,
    ApiGetAccountResponse,
    ApiGetAuthenticatedUserResponse,
    ApiGetLoginOptionsResponse,
    ApiLoginEmailOtpRequest,
    ApiLoginEmailOtpResponse,
    ApiRegisterUserResponse,
    ApiSuccessEmpty,
    ApiUserAllowedOrganizationsResponse,
    ApiVerifyLoginEmailOtpRequest,
    ApiVerifyLoginEmailOtpResponse,
    assertRegisteredAccount,
    CreatePersonalAccessToken,
    getEmailSchema,
    getRequestMethod,
    hasInviteCode,
    isEmailOnlyUser,
    LightdashRequestMethodHeader,
    NotFoundError,
    ParameterError,
    PersonalAccessToken,
    PersonalAccessTokenWithToken,
    RedshiftAwsSsoCompleteRequest,
    RedshiftAwsSsoCompleteResponse,
    RedshiftAwsSsoStartRequest,
    RedshiftAwsSsoStartResponse,
    RegisterOrActivateUser,
    UpsertUserWarehouseCredentials,
    UserWarehouseCredentials,
    validatePassword,
    WarehouseTypes,
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
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import Logger from '../logging/logger';
import { UserModel } from '../models/UserModel';
import {
    allowApiKeyAuthentication,
    allowOauthAuthentication,
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
     * @summary Get authenticated user
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('GetAuthenticatedUser')
    async getAuthenticatedUser(
        @Request() req: express.Request,
    ): Promise<ApiGetAuthenticatedUserResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const impersonationSession = req.session?.impersonation;
        const impersonation = impersonationSession
            ? {
                  adminUserUuid: impersonationSession.adminUserUuid,
                  adminName: impersonationSession.adminName,
                  impersonatedUserUuid: impersonationSession.targetUserUuid,
              }
            : null;

        return {
            status: 'ok',
            results: {
                ...UserModel.lightdashUserFromSession(
                    toSessionUser(req.account),
                ),
                impersonation,
            },
        };
    }

    /**
     * Register user
     * @summary Register user
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
        if ('inviteCode' in body && !hasInviteCode(body)) {
            throw new ParameterError('Invalid invite code');
        }
        if (!isEmailOnlyUser(body)) {
            if (!validatePassword(body.password)) {
                throw new ParameterError(
                    'Password must contain at least 8 characters, 1 letter and 1 number or 1 special character',
                );
            }
            if (
                typeof body.firstName !== 'string' ||
                typeof body.lastName !== 'string'
            ) {
                throw new ParameterError(
                    'First name and last name are required',
                );
            }
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
     * @summary Create email one-time passcode
     * @param req express request
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Put('/me/email/otp')
    @OperationId('CreateEmailOneTimePasscode')
    async createEmailOneTimePasscode(
        @Request() req: express.Request,
    ): Promise<ApiEmailStatusResponse> {
        assertRegisteredAccount(req.account);
        const user = toSessionUser(req.account);
        const status = await this.services
            .getUserService()
            .sendOneTimePasscodeToPrimaryEmail(
                user,
                user.isSetupComplete ? 'email_change' : 'signup_verification',
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * Get the verification status for the current user's primary email
     * @summary Get email verification status
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
        assertRegisteredAccount(req.account);
        // Throws 404 error if not found
        const status = await this.services
            .getUserService()
            .getPrimaryEmailStatus(toSessionUser(req.account), passcode);
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * List the organizations that the current user can join.
     * This is based on the user's primary email domain and the organization's allowed email domains.
     * @summary List available organizations
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/me/allowedOrganizations')
    @OperationId('ListMyAvailableOrganizations')
    async getOrganizationsUserCanJoin(
        @Request() req: express.Request,
    ): Promise<ApiUserAllowedOrganizationsResponse> {
        assertRegisteredAccount(req.account);
        const status = await this.services
            .getUserService()
            .getAllowedOrganizations(toSessionUser(req.account));
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }

    /**
     * Add the current user to an organization that accepts users with a verified email domain.
     * This will fail if the organization email domain does not match the user's primary email domain.
     * @summary Join organization
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
        assertRegisteredAccount(req.account);
        await this.services
            .getUserService()
            .joinOrg(toSessionUser(req.account), organizationUuid);
        const sessionUser = await req.services
            .getUserService()
            .getSessionByUserUuid(req.account.user.userUuid);
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
     * Remove the current user from their organization. Fails if the caller is
     * the only admin remaining. The user record is preserved so they can join
     * another organization later.
     * @summary Leave organization
     * @param req express request
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/me/leaveOrganization')
    @OperationId('LeaveOrganization')
    async leaveOrganization(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getUserService()
            .leaveOrganization(toSessionUser(req.account), {
                ip: req.ip,
                userAgent: req.get('user-agent'),
            });

        // Membership has already been removed and DB sessions wiped above.
        // Soft-fail this in-memory session destroy so a callback error doesn't
        // mask the successful leave from the client.
        await new Promise<void>((resolve) => {
            req.session.destroy((err) => {
                if (err) {
                    Logger.error(
                        'Failed to destroy session after leaving organization',
                        { error: err },
                    );
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
     * @summary Delete user
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Delete('/me')
    @OperationId('DeleteMe')
    async deleteUser(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getUserService()
            .delete(toSessionUser(req.account), req.account.user.userUuid);

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
     * @summary List warehouse credentials
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/warehouseCredentials')
    @OperationId('getWarehouseCredentials')
    async getWarehouseCredentials(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials[];
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .getWarehouseCredentials(toSessionUser(req.account)),
        };
    }

    /**
     * Create user warehouse credentials
     * @summary Create warehouse credentials
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/warehouseCredentials')
    @OperationId('createWarehouseCredentials')
    async createWarehouseCredentials(
        @Request() req: express.Request,
        @Body() body: UpsertUserWarehouseCredentials,
    ): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .createWarehouseCredentials(toSessionUser(req.account), body),
        };
    }

    /**
     * Start Redshift AWS SSO login
     * @summary Start Redshift AWS SSO login
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/warehouseCredentials/redshift/aws-sso/start')
    @OperationId('startRedshiftAwsSsoWarehouseCredentials')
    async startRedshiftAwsSsoWarehouseCredentials(
        @Request() req: express.Request,
        @Body() body: RedshiftAwsSsoStartRequest,
    ): Promise<RedshiftAwsSsoStartResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        let startRequest = body;
        if (body.projectUuid) {
            const project = await this.services
                .getProjectService()
                .getProject(body.projectUuid, req.account);
            if (project.warehouseConnection?.type !== WarehouseTypes.REDSHIFT) {
                throw new ParameterError(
                    'Redshift AWS SSO credentials can only be created for Redshift projects.',
                );
            }
            if (
                !project.warehouseConnection.awsSsoStartUrl ||
                !project.warehouseConnection.awsSsoRegion
            ) {
                throw new ParameterError(
                    'Redshift AWS SSO credentials require AWS IAM Identity Center to be configured on the project.',
                );
            }
            startRequest = {
                ...body,
                startUrl:
                    body.startUrl ?? project.warehouseConnection.awsSsoStartUrl,
                region: body.region ?? project.warehouseConnection.awsSsoRegion,
            };
        }
        const { session, results } = await this.services
            .getUserService()
            .startRedshiftAwsSsoDeviceAuthorization(startRequest);
        req.session.oauth = {
            ...(req.session.oauth ?? {}),
            redshiftAwsSso: session,
        };
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Complete Redshift AWS SSO login
     * @summary Complete Redshift AWS SSO login
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/warehouseCredentials/redshift/aws-sso/complete')
    @OperationId('completeRedshiftAwsSsoWarehouseCredentials')
    async completeRedshiftAwsSsoWarehouseCredentials(
        @Request() req: express.Request,
        @Body() body: RedshiftAwsSsoCompleteRequest,
    ): Promise<RedshiftAwsSsoCompleteResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        let completeRequest = body;
        if (body.projectUuid) {
            const project = await this.services
                .getProjectService()
                .getProject(body.projectUuid, req.account);
            if (project.warehouseConnection?.type !== WarehouseTypes.REDSHIFT) {
                throw new ParameterError(
                    'Redshift AWS SSO credentials can only be created for Redshift projects.',
                );
            }
            if (
                !project.warehouseConnection.awsSsoAccountId ||
                !project.warehouseConnection.awsSsoRoleName
            ) {
                throw new ParameterError(
                    'Redshift AWS SSO credentials require AWS IAM Identity Center to be configured on the project.',
                );
            }
            completeRequest = {
                ...body,
                accountId:
                    body.accountId ??
                    project.warehouseConnection.awsSsoAccountId,
                roleName:
                    body.roleName ?? project.warehouseConnection.awsSsoRoleName,
            };
        }
        const results = await this.services
            .getUserService()
            .completeRedshiftAwsSsoDeviceAuthorization(
                toSessionUser(req.account),
                req.session.oauth?.redshiftAwsSso,
                completeRequest,
            );

        if (results.status === 'authenticated') {
            if (body.projectUuid) {
                try {
                    await this.services
                        .getProjectService()
                        .upsertProjectCredentialsPreference(
                            toSessionUser(req.account),
                            body.projectUuid,
                            results.credentials.uuid,
                        );
                } catch (e) {
                    Logger.warn(
                        `Failed to set Redshift AWS SSO credentials preference for project ${body.projectUuid}`,
                        e,
                    );
                }
            }
            delete req.session.oauth?.redshiftAwsSso;
        }

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Update user warehouse credentials
     * @summary Update warehouse credentials
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUserService()
                .updateWarehouseCredentials(
                    toSessionUser(req.account),
                    uuid,
                    body,
                ),
        };
    }

    /**
     * Delete user warehouse credentials
     * @summary Delete warehouse credentials
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Delete('/warehouseCredentials/{uuid}')
    @OperationId('deleteWarehouseCredentials')
    async deleteWarehouseCredentials(
        @Request() req: express.Request,
        @Path() uuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getUserService()
            .deleteWarehouseCredentials(toSessionUser(req.account), uuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get login options
     * @summary Get login options
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

    @Post('/login-email-otp')
    @OperationId('LoginEmailOtp')
    async requestEmailOtpLogin(
        @Body() body: ApiLoginEmailOtpRequest,
    ): Promise<ApiLoginEmailOtpResponse> {
        if (!getEmailSchema().safeParse(body.email).success) {
            throw new ParameterError('Invalid email address');
        }
        await this.services.getUserService().requestEmailOtpLogin(body.email);
        this.setStatus(200);
        return { status: 'ok' };
    }

    @Post('/login-email-otp/verify')
    @OperationId('VerifyLoginEmailOtp')
    async verifyEmailOtpLogin(
        @Request() req: express.Request,
        @Body() body: ApiVerifyLoginEmailOtpRequest,
    ): Promise<ApiVerifyLoginEmailOtpResponse> {
        if (!getEmailSchema().safeParse(body.email).success) {
            throw new ParameterError('Invalid email address');
        }
        if (!/^\d{6}$/.test(body.passcode)) {
            throw new ParameterError('Invalid passcode format');
        }
        const sessionUser = await this.services
            .getUserService()
            .loginWithEmailOtp(body.email, body.passcode, {
                ip: req.ip,
                userAgent: req.get('user-agent'),
            });
        return new Promise((resolve, reject) => {
            req.login(sessionUser, (error) => {
                if (error) {
                    reject(error);
                    return;
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
     * List personal access tokens
     * @summary List personal access tokens
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/me/personal-access-tokens')
    @OperationId('Get personal access tokens')
    async getPersonalAccessTokens(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: PersonalAccessToken[];
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPersonalAccessTokenService()
                .getAllPersonalAccessTokens(req.account!),
        };
    }

    /**
     * Create personal access token
     * @summary Create personal access token
     */
    @Middlewares([
        // NOTE: We do NOT allow personal access tokens to be created with PAT authentication
        allowOauthAuthentication, // Allow creating PAT from OAuth tokens
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/me/personal-access-tokens')
    @OperationId('Create personal access token')
    async createPersonalAccessToken(
        @Request() req: express.Request,
        @Body() body: CreatePersonalAccessToken,
    ): Promise<{
        status: 'ok';
        results: PersonalAccessTokenWithToken;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPersonalAccessTokenService()
                .createPersonalAccessToken(
                    req.account!,
                    body,
                    getRequestMethod(req.header(LightdashRequestMethodHeader)),
                ),
        };
    }

    /**
     * Delete personal access token
     * @summary Delete personal access token
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Delete('/me/personal-access-tokens/{personalAccessTokenUuid}')
    @OperationId('Delete personal access token')
    async deletePersonalAccessToken(
        @Path() personalAccessTokenUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getPersonalAccessTokenService()
            .deletePersonalAccessToken(req.account!, personalAccessTokenUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Rotate personal access token
     * @summary Rotate personal access token
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/me/personal-access-tokens/{personalAccessTokenUuid}/rotate')
    @OperationId('Rotate personal access token')
    async rotatePersonalAccessToken(
        @Path() personalAccessTokenUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            expiresAt: Date;
        },
    ): Promise<{
        status: 'ok';
        results: PersonalAccessTokenWithToken;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPersonalAccessTokenService()
                .rotatePersonalAccessToken(
                    req.account!,
                    personalAccessTokenUuid,
                    body,
                ),
        };
    }

    /**
     * Get account information
     * @summary Get account
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/account')
    @OperationId('GetAccount')
    async getAccount(
        @Request() req: express.Request,
    ): Promise<ApiGetAccountResponse> {
        if (!req.account) {
            throw new NotFoundError('Account not found');
        }

        const { ability, ...userWithoutAbility } = req.account.user;

        this.setStatus(200);
        return {
            status: 'ok',
            results: {
                ...req.account,
                user: userWithoutAbility,
            },
        };
    }
}
