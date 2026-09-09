import { DbtProjectType, type DbtProjectConfig } from '@lightdash/common';

export const isBitbucketCloudConnection = (
    connection: DbtProjectConfig,
): boolean =>
    connection.type === DbtProjectType.BITBUCKET &&
    (!connection.host_domain?.trim() ||
        connection.host_domain.trim().toLowerCase().replace(/\.$/, '') ===
            'bitbucket.org');

export const getWritebackConnectionSupport = (connection: DbtProjectConfig) => {
    const editRepo =
        connection.type === DbtProjectType.GITHUB ||
        connection.type === DbtProjectType.GITLAB;
    return {
        editRepo,
        editDbtProject: editRepo || isBitbucketCloudConnection(connection),
    };
};
