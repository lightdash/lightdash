const OPTIMISTIC_MESSAGE_STUB = '___THINKING_STUB___';

export const getOptimisticMessageStub = (): string => {
    return OPTIMISTIC_MESSAGE_STUB;
};

export const isOptimisticMessageStub = (
    message: string | null | undefined,
): boolean => {
    return message === OPTIMISTIC_MESSAGE_STUB;
};
