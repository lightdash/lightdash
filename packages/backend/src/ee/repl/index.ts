import * as common from '@lightdash/common';
import repl from 'node:repl';
import app from '../../backendApp';

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
});
