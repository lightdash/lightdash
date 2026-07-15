import {
    ApiDepositWarehouseConnectionResponse,
    ApiErrorPayload,
    ApiWarehouseConnectCodeClaimResponse,
    ApiWarehouseConnectCodeResponse,
    assertRegisteredAccount,
    ClaimWarehouseConnectCodeRequest,
    DepositWarehouseConnectionRequest,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/warehouse-connect')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class WarehouseConnectController extends BaseController {
    /**
     * Creates a short-lived, single-use connect code the Lightdash CLI can use
     * to deposit warehouse credentials on behalf of the current user
     * @summary Create connect code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/code')
    @OperationId('CreateWarehouseConnectCode')
    async mintCode(
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectCodeResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectService()
                .mintCode(toSessionUser(req.account)),
        };
    }

    /**
     * Deposits durable warehouse credentials against a connect code. Called by
     * the Lightdash CLI; the connect code is the bearer credential, so this
     * endpoint is intentionally unauthenticated
     * @summary Deposit connection
     */
    @SuccessResponse('200', 'Success')
    @Post('/deposit')
    @OperationId('DepositWarehouseConnection')
    async deposit(
        @Body() body: DepositWarehouseConnectionRequest,
    ): Promise<ApiDepositWarehouseConnectionResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectService()
                .deposit(body),
        };
    }

    /**
     * Retrieves credentials deposited against a connect code created by the
     * current user. Returns them once and deletes the code
     * @summary Claim connect code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/claim')
    @OperationId('ClaimWarehouseConnectCode')
    async claim(
        @Body() body: ClaimWarehouseConnectCodeRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectCodeClaimResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectService()
                .claim(toSessionUser(req.account), body.code),
        };
    }
}
