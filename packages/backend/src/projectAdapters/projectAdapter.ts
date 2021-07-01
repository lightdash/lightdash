import { DbtProjectConfig } from '../config/parseConfig';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { DbtRemoteProjectAdapter } from './dbtRemoteProjectAdapter';
import { ProjectAdapter } from '../types';

export const projectAdapterFromConfig = (
    config: DbtProjectConfig,
): ProjectAdapter => {
    switch (config.type) {
        case 'dbt':
            return new DbtLocalProjectAdapter(
                config.project_dir,
                config.profiles_dir,
                config.rpc_server_port,
            );
        case 'dbt_remote_server':
            return new DbtRemoteProjectAdapter(
                config.rpc_server_host,
                config.rpc_server_port,
            );
        default:
            throw new Error('Project adapter not implemented');
    }
};
