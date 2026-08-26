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
        // Overlay flags for unpublished drafts; not part of the as-code document.
        'draftsAwaitingReview',
        'firstViewedAt',
        'hasUnpublishedChanges',
        'organizationUuid',
        // Represented as `ownerEmail` on the document for portability
        'owner',
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
        // Portable representation of the model's `owner`
        'ownerEmail',
        'spaceSlug',
        'verified',
        'version',
    ],
});
