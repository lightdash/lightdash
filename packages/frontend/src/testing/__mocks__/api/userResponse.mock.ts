import {
    OrganizationMemberRole,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';

export function mockUserResponse(
    overrides: Partial<LightdashUserWithAbilityRules> = {},
): LightdashUserWithAbilityRules {
    return {
        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
        email: 'demo@lightdash.com',
        firstName: 'David',
        lastName: 'Attenborough',
        organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
        organizationName: 'Jaffle Shop',
        organizationCreatedAt: new Date('2024-01-11T03:46:50.732Z'),
        isTrackingAnonymized: false,
        isMarketingOptedIn: true,
        isSetupComplete: true,
        role: OrganizationMemberRole.ADMIN,
        isActive: true,
        abilityRules: [
            {
                action: 'view',
                subject: 'OrganizationMemberProfile',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'CsvJobResult',
                conditions: {
                    createdByUserUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
                },
            },
            {
                action: 'view',
                subject: 'PinnedItems',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'Dashboard',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'Space',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'SavedChart',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'Project',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'Organization',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'ExportCsv',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'create',
                subject: 'Project',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'create',
                subject: 'Job',
            },
            {
                action: 'view',
                subject: 'Job',
                conditions: {
                    userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
                },
            },
            {
                action: 'view',
                subject: 'UnderlyingData',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'ChangeCsvResults',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Explore',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Dashboard',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Space',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'SavedChart',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Job',
            },
            {
                action: 'manage',
                subject: 'PinnedItems',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'update',
                subject: 'Project',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'SqlRunner',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Validation',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Project',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'InviteLink',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Organization',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'view',
                subject: 'Analytics',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'OrganizationMemberProfile',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'PinnedItems',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
            {
                action: 'manage',
                subject: 'Group',
                conditions: {
                    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
                },
            },
        ],
        updatedAt: new Date('2024-01-11T03:46:50.732Z'),
        createdAt: new Date('2024-01-11T03:46:50.732Z'),
        ...overrides,
    };
}
