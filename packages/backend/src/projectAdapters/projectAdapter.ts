import { DbtProjectConfig, ProjectType } from '../config/parseConfig';
import { ProjectAdapter } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { DbtRemoteProjectAdapter } from './dbtRemoteProjectAdapter';

export const projectAdapterFromConfig = (
    config: DbtProjectConfig,
): ProjectAdapter => {
    switch (config.type) {
        case ProjectType.DBT:
            return new DbtLocalProjectAdapter(
                config.project_dir,
                config.profiles_dir,
                config.rpc_server_port,
            );
        case ProjectType.DBT_REMOTE_SERVER:
            return new DbtRemoteProjectAdapter(
                config.rpc_server_host,
                config.rpc_server_port,
            );
        default:
            throw new Error('Project adapter not implemented');
    }
};
