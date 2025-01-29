import * as common from '@lightdash/common';
import repl from 'node:repl';
import App from '../../App';
import { lightdashConfig } from '../../config/lightdashConfig';
import knexConfig from '../../knexfile';
import { getEnterpriseAppArguments } from '../index';
import { getFixDuplicateSlugsScripts } from './scripts/fixDuplicateSlugs';
import { getListProjectsScripts } from './scripts/listProjects';

(async () => {
    const app = new App({
        lightdashConfig,
        port: process.env.PORT || 8080,
        environment:
            process.env.NODE_ENV === 'development'
                ? 'development'
                : 'production',
        knexConfig,
        ...(await getEnterpriseAppArguments()),
    });
    const replInstance = repl.start({
        prompt: 'lightdash > ',
    });

    const serviceRepository = app.getServiceRepository();
    const models = app.getModels();
    const database = app.getDatabase();

    Object.assign(replInstance.context, {
        common,
        serviceRepository,
        models,
        database,
        scripts: {
            fixDuplicateSlugs: getFixDuplicateSlugsScripts(database),
            listProjects: getListProjectsScripts(database),
        },
    });
})();
