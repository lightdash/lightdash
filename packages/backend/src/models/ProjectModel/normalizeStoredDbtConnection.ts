import { DbtProjectConfig, DbtProjectType } from '@lightdash/common';

/**
 * Fills in fields that older stored connections predate, so everything that
 * reads a connection sees the same meaning the adapter applies.
 *
 * GitHub connections saved before the GitHub App existed have no
 * `authorization_method`. The adapter has always treated that as "use the
 * PAT", but the settings form defaulted the missing value to OAuth, so users
 * saw "OAuth (recommended)" while their PAT was in use (PROD-11711). Rows are
 * encrypted per instance, so the meaning is made explicit at read time rather
 * than by rewriting them.
 */
export const normalizeStoredDbtConnection = (
    config: DbtProjectConfig,
): DbtProjectConfig => {
    if (
        config.type !== DbtProjectType.GITHUB ||
        config.authorization_method !== undefined
    ) {
        return config;
    }
    return {
        ...config,
        authorization_method:
            config.installation_id && !config.personal_access_token
                ? 'installation_id'
                : 'personal_access_token',
    };
};
