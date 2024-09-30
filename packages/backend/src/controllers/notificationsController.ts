import {
    ApiErrorPayload,
    ApiGetNotifications,
    ApiNotificationResourceType,
    ApiNotificationUpdateParams,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/notifications')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Notifications')
export class NotificationsController extends BaseController {
    /**
     * Gets notifications for a user based on the type
     * @param req express request
     * @query type the type of notification to get
     * @returns the notifications for a user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getNotifications')
    async getNotifications(
        @Request() req: express.Request,
        @Query() type: ApiNotificationResourceType,
    ): Promise<ApiGetNotifications> {
        const results = await this.services
            .getNotificationService()
            .getNotifications(req.user!.userUuid, type);

        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Update notification
     * @param req express request
     * @param notificationId the id of the notification
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('{notificationId}')
    @OperationId('updateNotification')
    async updateNotification(
        @Path() notificationId: string,
        @Body() body: ApiNotificationUpdateParams,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getNotificationService()
            .updateNotification(notificationId, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
