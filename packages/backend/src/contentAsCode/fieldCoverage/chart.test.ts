import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'chart',
    modelSchema: 'SavedChartDAO',
    documentSchema: 'ChartAsCode',
    skippedModelFields: [
        'colorPalette',
        'colorPaletteUuid',
        'dashboardName',
        'dashboardUuid',
        'deletedAt',
        'deletedBy',
        'organizationUuid',
        'pinnedListOrder',
        'pinnedListUuid',
        'projectUuid',
        'resolvedColorPalette',
        'spaceName',
        'spaceUuid',
        'updatedByUser',
        'uuid',
    ],
    documentOnlyFields: [
        'contentType',
        'dashboardSlug',
        'downloadedAt',
        'spaceSlug',
        'verified',
        'version',
    ],
});
