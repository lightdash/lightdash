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
        'effectiveWarehouseConnection',
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
        'warehouseConnectionUuid',
    ],
    documentOnlyFields: ['contentType', 'spaceName', 'version'],
});
