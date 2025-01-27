import Logger from '../../../../../logging/logger';

export const toolErrorWrapper =
    <
        T extends unknown[],
        U extends unknown,
        V extends (...args: T) => Promise<U>,
    >(
        func: V,
    ) =>
    (...args: T): Promise<U> => {
        try {
            return func(...args);
        } catch (e) {
            Logger.error('Error in tool function', e);
            throw e;
        }
    };
