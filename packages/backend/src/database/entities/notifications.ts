export type DbNotifications = {
    notification_id: string;
    created_at: Date;
    comment_id: string | null;
    dashboard_uuid: string | null;
    dashboard_tile_uuid: string | null;
    viewed: boolean;
    user_uuid: string;
};
