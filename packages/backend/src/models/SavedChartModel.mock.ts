type VersionSummaryRow = {
    saved_query_uuid: string;
    saved_queries_version_uuid: string;
    created_at: Date;
    user_uuid: string | null;
    first_name: string | null;
    last_name: string | null;
};

export const chartSummary: VersionSummaryRow = {
    saved_query_uuid: 'chart_uuid',
    saved_queries_version_uuid: 'version_uuid',
    created_at: new Date(),
    user_uuid: null,
    first_name: null,
    last_name: null,
};
