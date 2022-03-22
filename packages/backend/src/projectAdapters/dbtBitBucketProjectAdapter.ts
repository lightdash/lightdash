import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
} from 'common';
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
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
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
        targetName,
        environment,
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
            targetName,
            environment,
        });
    }
}
