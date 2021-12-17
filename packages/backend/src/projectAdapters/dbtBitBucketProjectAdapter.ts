import { CreateWarehouseCredentials } from 'common';
import { WarehouseClient } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const DEFAULT_HOST_DOMAIN = 'bitbucket.org';

type Args = {
    warehouseClient: WarehouseClient;
    username: string;
    personalAccessToken: string;
    repository: string;
    branch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    hostDomain?: string;
};

export class DbtBitBucketProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        username,
        branch,
        personalAccessToken,
        repository,
        projectDirectorySubPath,
        warehouseCredentials,
        hostDomain,
    }: Args) {
        const remoteRepositoryUrl = `https://${username}:${personalAccessToken}@${
            hostDomain || DEFAULT_HOST_DOMAIN
        }/${repository}.git`;
        super({
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
        });
    }
}
