import Logger from '../logging/logger';

export abstract class BaseService {
    protected logger: typeof Logger = Logger;

    constructor({
        logger,
    }: {
        logger?: typeof Logger;
    } = {}) {
        /**
         * Logger can be overriden as part of the constructor, e.g to provide a scoped
         * logger instance.
         */
        if (logger) {
            this.logger = logger;
        }
    }
}
