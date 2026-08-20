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
        // A chart's merge is not expressible as code yet; the saved shape is
        // experimental alongside the endpoint.
        'merge',
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
        'downloadedAt',
        'spaceSlug',
        'verified',
        'version',
    ],
});
