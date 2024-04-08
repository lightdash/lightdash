import Logger from '../logging/logger';

export abstract class BaseService {
    protected logger: typeof Logger;

    constructor({
        logger,
        serviceName,
        loggerParams,
    }: {
        logger?: typeof Logger;

        /** If provided, is used for things like instancing the child logger */
        serviceName?: string;

        /**
         * Arbitrary values passed to a child logger, if `logger` is not provided.
         */
        loggerParams?: Record<string, unknown>;
    } = {}) {
        /**
         * Logger can be overriden as part of the constructor, e.g to provide a scoped
         * logger instance.
         */
        this.logger =
            logger ??
            Logger.child({
                serviceName: serviceName ?? this.constructor.name,
                ...(loggerParams ?? {}),
            });
    }
}
