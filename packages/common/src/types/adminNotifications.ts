export enum AdminNotificationType {
    ORG_ADMIN_ADDED = 'org_admin_added',
    ORG_ADMIN_REMOVED = 'org_admin_removed',
    PROJECT_ADMIN_ADDED = 'project_admin_added',
    PROJECT_ADMIN_REMOVED = 'project_admin_removed',
    DATABASE_CONNECTION_CHANGE = 'database_connection_change',
    DBT_CONNECTION_CHANGE = 'dbt_connection_change',
}

export type ChangeDetail = {
    field: string;
};

export type AdminNotificationPayload = {
    type: AdminNotificationType;
    organizationUuid: string;
    organizationName: string;
    projectUuid?: string;
    projectName?: string;
    changedBy: {
        userUuid?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        isServiceAccount: boolean;
        serviceAccountDescription?: string;
    };
    targetUser?: {
        userUuid: string;
        email: string;
        firstName: string;
        lastName: string;
    };
    timestamp: Date;
    changes: ChangeDetail[];
    settingsUrl: string;
};
