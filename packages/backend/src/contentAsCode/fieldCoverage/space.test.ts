import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'space',
    modelSchema: 'Space',
    documentSchema: 'SpaceAsCode',
    skippedModelFields: [
        'breadcrumbs',
        'childSpaces',
        'colorPaletteUuid',
        'dashboards',
        'groupsAccess',
        'inheritParentPermissions',
        'inheritsFromOrgOrProject',
        'name',
        'organizationUuid',
        'parentSpaceUuid',
        'path',
        'pinnedListOrder',
        'pinnedListUuid',
        'projectMemberAccessRole',
        'projectUuid',
        'queries',
        'uuid',
    ],
    documentOnlyFields: ['contentType', 'spaceName', 'version'],
});
