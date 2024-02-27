import {
    ApiCreateNotification,
    ApiErrorPayload,
    ApiGetNotifications,
    NotificationType,
} from '@lightdash/common';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
import { notificationsService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/notifications')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Notifications')
export class NotificationsController extends Controller {
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
        @Query() type: NotificationType,
    ): Promise<ApiGetNotifications> {
        let results: ApiGetNotifications['results'] = [];
        switch (type) {
            case NotificationType.DASHBOARD_COMMENTS:
                results =
                    await notificationsService.getDashboardCommentNotifications(
                        req.user!.userUuid,
                    );
                break;
            default:
                break;
        }
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Create notification for a dashboard comment
     * @param req express request
     * @param dashboardUuid the uuid of the dashboard
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{commentId}/dashboard/{dashboardUuid}')
    @OperationId('createNotificationForDashboardComment')
    async createDashboardCommentNotification(
        @Path() commentId: string,
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiCreateNotification> {
        await notificationsService.createDashboardCommentNotification(
            req.user!.userUuid,
            commentId,
            dashboardUuid,
        );

        this.setStatus(200);
        return {
            status: 'ok',
        };
    }

    /**
     * Mark a notification as read
     * @param req express request
     * @param notificationId the id of the notification
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('{notificationId}/markAsRead')
    @OperationId('markNotificationAsRead')
    async markNotificationAsRead(
        @Path() notificationId: string,
    ): Promise<ApiCreateNotification> {
        await notificationsService.markNotificationAsRead(notificationId);

        this.setStatus(200);
        return {
            status: 'ok',
        };
    }
}
