import { DbtProjectType, type DbtProjectConfig } from '@lightdash/common';

export const isBitbucketCloudConnection = (
    connection: DbtProjectConfig | undefined,
): boolean => {
    if (connection?.type !== DbtProjectType.BITBUCKET) {
        return false;
    }
    const host = connection.host_domain
        ?.trim()
        .toLowerCase()
        .replace(/\.$/, '');
    return !host || host === 'bitbucket.org';
};
