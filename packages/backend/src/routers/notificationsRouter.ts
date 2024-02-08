import express from 'express';
import { isAuthenticated } from '../controllers/authentication';
import { notificationsService } from '../services/services';

export const notificationsRouter = express.Router({ mergeParams: true });

notificationsRouter.get('/', isAuthenticated, async (req, res, next) => {
    try {
        let results;
        const { type } = req.query;

        switch (type) {
            case 'dashboardComments':
                results =
                    await notificationsService.getDashboardCommentNotifications(
                        req.user!.userUuid,
                    );
                break;
            default:
                // TODO: Handle default case or throw an error if type is required
                break;
        }

        res.json({
            status: 'ok',
            results,
        });
    } catch (e) {
        next(e);
    }
});

notificationsRouter.patch(
    '/:notificationId',
    isAuthenticated,
    async (req, res, next) => {
        try {
            await notificationsService.markNotificationAsRead(
                req.params.notificationId,
            );
            res.json({
                status: 'ok',
            });
        } catch (e) {
            next(e);
        }
    },
);
