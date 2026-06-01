import { type LightdashConfig } from '../../config/parseConfig';
import { type OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';

export type OrganizationExportLimits = {
    /** Max rows a query/export may return (LIGHTDASH_QUERY_MAX_LIMIT override). */
    maxLimit: number;
    /** Max cells (rows × columns) a CSV/Excel export may contain
     *  (LIGHTDASH_CSV_CELLS_LIMIT override). */
    csvCellsLimit: number;
};

/**
 * Resolves an org's effective export limits: the per-org override from
 * `organization_settings` when set, otherwise the instance env default. Used at
 * query/export enforcement points so each org's limits apply without changing
 * behavior for orgs that haven't overridden anything.
 */
export const resolveOrganizationExportLimits = async (
    organizationSettingsModel: OrganizationSettingsModel,
    query: Pick<LightdashConfig['query'], 'maxLimit' | 'csvCellsLimit'>,
    organizationUuid: string,
): Promise<OrganizationExportLimits> => {
    const settings = await organizationSettingsModel.get(organizationUuid);
    return {
        maxLimit: settings.queryMaxLimit ?? query.maxLimit,
        csvCellsLimit: settings.csvCellsLimit ?? query.csvCellsLimit,
    };
};
