import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { CachedWarehouse } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { ProfileWriteResult, writeWarehouseProfile } from './profileWriter';

/**
 * Base args when profiles directory is provided explicitly
 */
type DbtLocalProjectAdapterBaseArgs = {
    warehouseClient: WarehouseClient;
    projectDir: string;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
    selector?: string;
    analytics?: LightdashAnalytics;
};

/**
 * Args when providing explicit profile directory and environment
 */
type DbtLocalProjectAdapterExplicitProfileArgs =
    DbtLocalProjectAdapterBaseArgs & {
        profilesDir: string;
        target: string | undefined;
        profileName?: string | undefined;
        environment?: Record<string, string>;
        warehouseCredentials?: undefined;
    };

/**
 * Args when providing warehouse credentials (profile will be generated)
 */
type DbtLocalProjectAdapterCredentialsArgs = DbtLocalProjectAdapterBaseArgs & {
    warehouseCredentials: CreateWarehouseCredentials;
    targetName?: string | undefined;
    environment?: DbtProjectEnvironmentVariable[] | undefined;
    profilesDir?: undefined;
    profileName?: undefined;
    target?: undefined;
};

export type DbtLocalProjectAdapterArgs =
    | DbtLocalProjectAdapterExplicitProfileArgs
    | DbtLocalProjectAdapterCredentialsArgs;

function hasWarehouseCredentials(
    args: DbtLocalProjectAdapterArgs,
): args is DbtLocalProjectAdapterCredentialsArgs {
    return (
        'warehouseCredentials' in args &&
        args.warehouseCredentials !== undefined
    );
}

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    private profileWriteResult: ProfileWriteResult | null = null;

    constructor(args: DbtLocalProjectAdapterArgs) {
        let profilesDir: string;
        let target: string | undefined;
        let profileName: string | undefined;
        let environment: Record<string, string>;
        let profileWriteResult: ProfileWriteResult | null = null;

        if (hasWarehouseCredentials(args)) {
            // Generate profile from warehouse credentials
            profileWriteResult = writeWarehouseProfile({
                warehouseCredentials: args.warehouseCredentials,
                targetName: args.targetName,
                environment: args.environment,
            });
            profilesDir = profileWriteResult.profilesDir;
            target = profileWriteResult.targetName;
            profileName = profileWriteResult.profileName;
            environment = profileWriteResult.environment;
        } else {
            // Use explicit profile directory
            profilesDir = args.profilesDir;
            target = args.target;
            profileName = args.profileName;
            environment = args.environment || {};
        }

        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: args.projectDir,
            dbtProfilesDirectory: profilesDir,
            environment,
            profileName,
            target,
            dbtVersion: args.dbtVersion,
            useDbtLs: args.useDbtLs,
            selector: args.selector,
        });

        super(
            dbtClient,
            args.warehouseClient,
            args.cachedWarehouse,
            args.dbtVersion,
            args.projectDir,
            args.analytics,
        );

        this.profileWriteResult = profileWriteResult;
    }

    async destroy() {
        if (this.profileWriteResult) {
            await this.profileWriteResult.cleanup();
        }
        await super.destroy();
    }
}
