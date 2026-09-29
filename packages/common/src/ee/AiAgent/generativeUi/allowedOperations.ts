// operationIds exactly as TSOA generates them (some contain spaces).
export const GENERATIVE_UI_ALLOWED_OPERATION_IDS: ReadonlySet<string> = new Set(
    [
        // Reads
        'ListSpacesInProject',
        'GetSpace',
        'GetSpaceDeleteImpact',
        'ListChartSummariesInProject',
        'ListChartsInProject',
        'getDashboards',
        'GetExplores',
        'getPinnedItems',
        'getFavorites',
        'ListSchedulers',
        'getDashboardSchedulers',
        'GetAuthenticatedUser',
        // Low-impact writes
        'CreateSpaceInProject',
        'UpdateSpace',
        'DeleteSpace',
        'Move content',
        'updateDashboards',
        'toggleFavorite',
        'updatePinnedItemsOrder',
        'createDashboardScheduler',
        'createSavedChartScheduler',
        'updateScheduler',
        'deleteScheduler',
        'createComment',
        'deleteComment',
        'ValidateProject',
    ],
);
