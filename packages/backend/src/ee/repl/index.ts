import * as common from '@lightdash/common';
import repl from 'node:repl';
import App from '../../App';
import { lightdashConfig } from '../../config/lightdashConfig';
import knexConfig from '../../knexfile';
import { getEnterpriseAppArguments } from '../index';
import { getConsolidateAgentMemoryScripts } from './scripts/consolidateAgentMemory';
import { getListProjectsScripts } from './scripts/listProjects';
import { getReviewClassifierScoreboardScripts } from './scripts/reviewClassifierScoreboard';

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
    const clients = app.getClients();
    const database = app.getDatabase();

    Object.assign(replInstance.context, {
        common,
        serviceRepository,
        models,
        clients,
        database,
        scripts: {
            ...getConsolidateAgentMemoryScripts(serviceRepository),
            ...getListProjectsScripts(database),
            ...getReviewClassifierScoreboardScripts(
                database,
                serviceRepository,
            ),
        },
    });
})();
