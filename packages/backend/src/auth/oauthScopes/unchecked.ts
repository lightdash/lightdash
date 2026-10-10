import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
import { RequestHandler } from 'express';
import { getOAuthScopeContext } from './scopedAbility';

export const OAUTH_UNCHECKED_OPERATIONS = {
    'OrganizationHomepageSettingsController.getSettings': 'read',
    'UserController.completeUserOnboardingTour': 'write',
    'UserController.markUserLearnScopeStarted': 'write',
    'UserController.markUserLearnScopeCompleted': 'write',
    'UserController.mergeUserLearnProgress': 'write',
    'UserController.joinOrganization': 'write',
    'UserController.getOrganizationsUserCanJoin': 'read',
    'UserController.getWarehouseCredentials': 'read',
    'UserController.createWarehouseCredentials': 'write',
    'UserController.startRedshiftAwsSsoWarehouseCredentials': 'write',
    'UserController.completeRedshiftAwsSsoWarehouseCredentials': 'write',
    'UserController.updateWarehouseCredentials': 'write',
    'UserController.deleteWarehouseCredentials': 'write',
    'UserAvatarController.updateMyAvatar': 'write',
    'UserAvatarController.deleteMyAvatar': 'write',
    'UsersAvatarController.getUserAvatar': 'read',
    'GoogleDriveController.get': 'read',
    'DeployController.addDeployBatch': 'write',
    'DeployController.finalizeDeploySession': 'write',
    'QuerySourceController.getSourceQueryStatus': 'read',
    'FeatureFlagController.getFeatureFlag': 'read',
    'ShareController.create': 'write',
    'SlackController.get': 'read',
    'SlackController.getChannelById': 'read',
    'SlackController.updateCustomSettings': 'write',
    'BigquerySSOController.getBigQueryDatabases': 'read',
    'BigquerySSOController.getBigQueryProjects': 'read',
    'BigquerySSOController.getBigQueryProjectRecommendation': 'read',
    'NotificationsController.getNotifications': 'read',
    'NotificationsController.updateNotification': 'write',
    'OrganizationController.getColorPalettes': 'read',
    'AiOrganizationSettingsController.getRuntimeSettings': 'read',
    'AiAgentController.getAgentExploreAccessSummary': 'read',
    'AiThreadFileController.upload': 'write',
    'AiThreadFileController.delete': 'write',
    'MobilePushNotificationController.registerInstallation': 'write',
    'MobilePushNotificationController.registerLiveActivityPushToStartToken':
        'write',
    'MobilePushNotificationController.revokeInstallation': 'write',
    'AiAgentLiveActivityController.registerLiveActivity': 'write',
    'AiAgentLiveActivityController.revokeLiveActivity': 'write',
    'organizationRouter.getOrganizationAccess': 'read',
    'organizationRouter.getActiveCreateProjectJob': 'read',
    'organizationRouter.getOnboarding': 'read',
    'organizationRouter.setOnboardingSuccessDate': 'write',
    'dashboardRouter.getDashboardViews': 'read',
    'UserService.verifyEmail': 'write',
} as const;

export const assertOAuthScopeOperation = (
    actor: Account | SessionUser,
    operation: keyof typeof OAUTH_UNCHECKED_OPERATIONS,
): void => {
    if (isAccount(actor) && actor.authentication.type !== 'oauth') return;
    const context = getOAuthScopeContext(
        isAccount(actor) ? actor.user.ability : actor.ability,
    );
    if (context === null) return;
    const classification = Object.hasOwn(OAUTH_UNCHECKED_OPERATIONS, operation)
        ? OAUTH_UNCHECKED_OPERATIONS[operation]
        : null;
    const allowed =
        classification !== null &&
        context.scopes.some(
            (scope) =>
                scope === 'write' ||
                scope === 'mcp:write' ||
                (classification === 'read' &&
                    (scope === 'read' || scope === 'mcp:read')),
        );
    if (allowed) return;
    context.record(classification ?? 'unknown', operation, null);
    if (context.mode === 'enforce') {
        throw new ForbiddenError('OAuth scope does not allow this operation');
    }
};

export const requireOAuthScopeOperation =
    (operation: keyof typeof OAUTH_UNCHECKED_OPERATIONS): RequestHandler =>
    (req, _res, next) => {
        try {
            if (req.account) {
                assertOAuthScopeOperation(req.account, operation);
            }
            next();
        } catch (error) {
            next(error);
        }
    };
