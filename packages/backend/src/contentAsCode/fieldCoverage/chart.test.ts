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
        // Overlay flags for unpublished drafts; not part of the as-code document.
        'dismissedDraftUuid',
        'draftOverlayError',
        'draftsAwaitingReview',
        'hasUnpublishedChanges',
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
        'access',
        'contentType',
        'downloadedAt',
        'spaceSlug',
        'verified',
        'version',
    ],
});
