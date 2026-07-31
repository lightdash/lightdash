import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiLearnCatalogueResponse,
    type ApiLearnCourseResponse,
    type ApiLearnEventsResponse,
    type ApiLearnProgressResponse,
    type LearnEventInput,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/learn')
// These endpoints are under development and susceptible to breaking changes.
// Keep them hidden until the feature is GA.
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class LearnController extends BaseController {
    /**
     * Get the Lightdash University course catalogue.
     * @summary Get the Learn catalogue
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/catalogue')
    @OperationId('getLearnCatalogue')
    async getLearnCatalogue(
        @Request() req: express.Request,
    ): Promise<ApiLearnCatalogueResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnService()
                .getCatalogue(req.account),
        };
    }

    /**
     * Get a published course payload (lessons and quiz) by course id.
     * @summary Get a Learn course
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/courses/{courseId}')
    @OperationId('getLearnCourse')
    async getLearnCourse(
        @Request() req: express.Request,
        @Path() courseId: string,
    ): Promise<ApiLearnCourseResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnService()
                .getCourse(req.account, courseId),
        };
    }

    /**
     * Get the signed-in user's Learn progress rollups. `courses` is null when
     * the instance has no Learn service token configured (client-local mode).
     * @summary Get Learn progress
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/progress')
    @OperationId('getLearnProgress')
    async getLearnProgress(
        @Request() req: express.Request,
    ): Promise<ApiLearnProgressResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnService()
                .getProgress(req.account),
        };
    }

    /**
     * Append learning events for the signed-in user. The event source is
     * always recorded as 'learn' server-side.
     * @summary Record Learn events
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/events')
    @OperationId('recordLearnEvents')
    async recordLearnEvents(
        @Request() req: express.Request,
        @Body() body: LearnEventInput[],
    ): Promise<ApiLearnEventsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getLearnService()
                .recordEvents(req.account, body),
        };
    }
}
