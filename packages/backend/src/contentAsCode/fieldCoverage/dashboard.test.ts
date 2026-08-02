import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'dashboard',
    modelSchema: 'DashboardDAO',
    documentSchema: 'DashboardAsCode',
    skippedModelFields: [
        'colorPaletteUuid',
        'dashboardVersionId',
        'deletedAt',
        'deletedBy',
        'firstViewedAt',
        'organizationUuid',
        'pinnedListOrder',
        'pinnedListUuid',
        'projectUuid',
        'spaceName',
        'spaceUuid',
        'updatedByUser',
        'uuid',
        'versionUuid',
        'views',
    ],
    documentOnlyFields: [
        'contentType',
        'downloadedAt',
        'spaceSlug',
        'verified',
        'version',
    ],
});
