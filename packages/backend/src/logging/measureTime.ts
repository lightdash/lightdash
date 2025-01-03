import { type Logger } from 'winston';

export const measureTime = async <T, C>(
    fn: () => Promise<T>,
    name: string,
    logger: Logger,
    context?: C,
): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const duration = end - start;

    logger.info(
        `${name} - operation completed in ${duration.toFixed(
            2,
        )}ms - Context: ${JSON.stringify(context)}`,
        { name, duration, context },
    );

    return result;
};
