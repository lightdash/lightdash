import { DbtProjectConfig, DbtProjectType } from '@lightdash/common';

/**
 * Returns a dbt connection with its GitHub App `installation_id` replaced by the
 * current org-level installation id when the two differ.
 *
 * The installation id is snapshotted into a project's `dbt_connection` when the
 * connection form is saved, and is never refreshed afterwards. When an org
 * uninstalls and reinstalls the Lightdash GitHub App, GitHub mints a new
 * installation id and the org-level `github_app_installations` row is updated,
 * but existing projects keep the stale id - so `getInstallationToken` 404s on
 * every compile/refresh. Re-resolving from the org-level installation (the
 * single source of truth) before building the adapter keeps refresh working.
 *
 * Pure: callers fetch the current installation id and pass it in.
 */
export const applyCurrentGithubInstallationId = (
    dbtConnection: DbtProjectConfig,
    currentInstallationId: string | undefined,
): DbtProjectConfig => {
    if (
        dbtConnection.type === DbtProjectType.GITHUB &&
        dbtConnection.authorization_method === 'installation_id' &&
        currentInstallationId &&
        currentInstallationId !== dbtConnection.installation_id
    ) {
        return {
            ...dbtConnection,
            installation_id: currentInstallationId,
        };
    }
    return dbtConnection;
};
