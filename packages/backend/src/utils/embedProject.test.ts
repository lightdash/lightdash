import {
    DbtProjectType,
    ProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
    WeekDay,
    type Project,
} from '@lightdash/common';
import { pickEmbedProject } from './embedProject';

const project: Project = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    slug: 'jaffle-shop',
    name: 'Jaffle shop',
    type: ProjectType.DEFAULT,
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        authorization_method: 'personal_access_token',
        repository: 'acme/analytics',
        branch: 'main',
        project_sub_path: '/',
        personal_access_token: 'ghp_secret',
    },
    warehouseConnection: {
        type: WarehouseTypes.SNOWFLAKE,
        account: 'acme-prod.eu-west-1',
        role: 'ANALYTICS_READER',
        database: 'PROD',
        warehouse: 'WH_SMALL',
        schema: 'REPORTING',
        startOfWeek: WeekDay.SUNDAY,
    },
    pinnedListUuid: 'pinned-uuid',
    upstreamProjectUuid: 'upstream-uuid',
    dbtVersion: SupportedDbtVersions.V1_11,
    schedulerTimezone: 'UTC',
    queryTimezone: 'Asia/Tokyo',
    useProjectTimezoneInFilters: true,
    schedulerFailureNotifyRecipients: true,
    schedulerFailureIncludeContact: true,
    schedulerFailureContactOverride: 'ops@acme.example',
    createdByUserUuid: 'creator-uuid',
    organizationWarehouseCredentialsUuid: 'org-creds-uuid',
    hasDefaultUserSpaces: true,
    projectDefaults: { column_totals: false },
    colorPaletteUuid: 'palette-uuid',
    expiresAt: null,
    provisioningSource: 'terraform',
    agentSqlScope: { schemas: ['reporting'] },
};

describe('pickEmbedProject', () => {
    test('keeps the settings a dashboard needs to render', () => {
        expect(pickEmbedProject(project)).toEqual({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            slug: 'jaffle-shop',
            name: 'Jaffle shop',
            type: ProjectType.DEFAULT,
            dbtConnection: { type: DbtProjectType.NONE },
            warehouseConnection: {
                type: WarehouseTypes.SNOWFLAKE,
                startOfWeek: WeekDay.SUNDAY,
            },
            dbtVersion: SupportedDbtVersions.V1_11,
            schedulerTimezone: 'UTC',
            queryTimezone: 'Asia/Tokyo',
            useProjectTimezoneInFilters: true,
            schedulerFailureNotifyRecipients: false,
            schedulerFailureIncludeContact: false,
            schedulerFailureContactOverride: null,
            createdByUserUuid: null,
            hasDefaultUserSpaces: true,
            projectDefaults: { column_totals: false },
            colorPaletteUuid: 'palette-uuid',
            expiresAt: null,
            provisioningSource: null,
            agentSqlScope: null,
        });
    });

    test('drops warehouse identifiers, the dbt source and people', () => {
        const json = JSON.stringify(pickEmbedProject(project));

        [
            'acme-prod.eu-west-1',
            'ANALYTICS_READER',
            'PROD',
            'WH_SMALL',
            'REPORTING',
            'acme/analytics',
            'ghp_secret',
            'creator-uuid',
            'ops@acme.example',
            'upstream-uuid',
            'pinned-uuid',
            'org-creds-uuid',
            'terraform',
        ].forEach((secret) => expect(json).not.toContain(secret));
    });

    test('leaves the warehouse connection absent when the project has none', () => {
        expect(
            pickEmbedProject({ ...project, warehouseConnection: undefined })
                .warehouseConnection,
        ).toBeUndefined();
    });
});
