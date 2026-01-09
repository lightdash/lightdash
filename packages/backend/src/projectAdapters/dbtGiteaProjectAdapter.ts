import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { CachedWarehouse } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const DEFAULT_GITEA_HOST_DOMAIN = 'gitea.com';

const getBaseUrl = (hostDomain?: string) => {
    if (!hostDomain) return `https://${DEFAULT_GITEA_HOST_DOMAIN}`;
    const trimmed = hostDomain.replace(/\/+$/, '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

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
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
    selector?: string;
    analytics?: LightdashAnalytics;
};

export class DbtGiteaProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        analytics,
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
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
        selector,
    }: Args) {
        const baseUrl = getBaseUrl(hostDomain);
        const url = new URL(baseUrl);
        url.username = username;
        url.password = personalAccessToken;
        const remoteRepositoryUrl = `${url
            .toString()
            .replace(/\/$/, '')}/${repository}.git`;
        super({
            analytics,
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            repository,
            projectDirectorySubPath,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
            dbtVersion,
            useDbtLs,
            selector,
        });
    }
}
