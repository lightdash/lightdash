import {
    DbtProjectType,
    type Project,
    type WarehouseCredentials,
} from '@lightdash/common';

// Embed viewers only need the connection's dialect and week settings; the
// warehouse identifiers (account, host, database, role...) stay server-side.
const pickEmbedWarehouseConnection = (
    warehouseConnection: WarehouseCredentials,
): WarehouseCredentials =>
    ({
        type: warehouseConnection.type,
        startOfWeek: warehouseConnection.startOfWeek,
    }) as WarehouseCredentials;

export const pickEmbedProject = (project: Project): Project => ({
    organizationUuid: project.organizationUuid,
    projectUuid: project.projectUuid,
    slug: project.slug,
    name: project.name,
    type: project.type,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseConnection: project.warehouseConnection
        ? pickEmbedWarehouseConnection(project.warehouseConnection)
        : undefined,
    dbtVersion: project.dbtVersion,
    schedulerTimezone: project.schedulerTimezone,
    queryTimezone: project.queryTimezone,
    useProjectTimezoneInFilters: project.useProjectTimezoneInFilters,
    schedulerFailureNotifyRecipients: false,
    schedulerFailureIncludeContact: false,
    schedulerFailureContactOverride: null,
    createdByUserUuid: null,
    hasDefaultUserSpaces: project.hasDefaultUserSpaces,
    projectDefaults: project.projectDefaults,
    colorPaletteUuid: project.colorPaletteUuid,
    expiresAt: project.expiresAt,
    provisioningSource: null,
    agentSqlScope: null,
});
