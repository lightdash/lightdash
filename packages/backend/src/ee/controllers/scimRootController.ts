import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../../controllers/baseController';
import { isScimAuthenticated } from '../authentication';

@Route('/api/v1/scim/v2')
@Hidden()
@Tags('SCIM')
export class ScimRootController extends BaseController {
    /**
     * Root SCIM endpoint for validating SCIM configuration
     * @param req express request
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimRoot')
    @Response('200', 'Success')
    async getScimRoot(@Request() req: express.Request): Promise<void> {
        // Return empty success response as expected by identity providers
        this.setStatus(200);
    }
}
