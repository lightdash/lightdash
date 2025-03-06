// You can use these to filter successful or rejected promises using Promise.allSettled
export const isFulfilled = <T>(
    input: PromiseSettledResult<T>,
): input is PromiseFulfilledResult<T> => input.status === 'fulfilled';
export const isRejected = (
    input: PromiseSettledResult<unknown>,
): input is PromiseRejectedResult => input.status === 'rejected';

export const getFulfilledValues = <T>(
    results: PromiseSettledResult<T>[],
): T[] => results.filter(isFulfilled).map((result) => result.value);
