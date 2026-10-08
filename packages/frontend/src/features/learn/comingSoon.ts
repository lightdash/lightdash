/** Modules awaiting an interactive format. This inventory does not grant permissions. */
export const COMING_SOON_SCOPES = [
    // view and create are content-as-code lessons (codeLessons.ts); manage
    // only waives upload checks a learner's copy already passes (CS-283).
    'manage:ContentAsCode',
    'promote:SavedChart',
    'promote:Dashboard',
    'view:EmbedDashboardFilters',
    'view:EmbedDashboardFilterAddition',
    'view:EmbedDashboardParameters',
    'view:EmbedCsvExport',
    'view:EmbedImageExport',
    'view:EmbedPagePdfExport',
    'view:EmbedDashboardCsvExport',
    'view:EmbedDateZoom',
    'view:EmbedExplore',
    'view:EmbedUnderlyingData',
    'view:EmbedDataApps',
    'view:EmbedAiAgent',
    'view:EmbedAiAgentDebug',
    'view:EmbedCompiledSql',
    'view:Analytics',
    'view:AiAgentSkill',
    'manage:AiAgentSkill',
] as const;
