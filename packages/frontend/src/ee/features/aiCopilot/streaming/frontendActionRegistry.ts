export type FrontendActionHandlerResult = {
    status: 'success' | 'error';
    result: string;
};

export type FrontendActionHandler = (args: {
    toolCallId: string;
    threadUuid: string;
    action: string;
    payload: unknown;
    signal: AbortSignal;
}) => Promise<FrontendActionHandlerResult>;

const frontendActionHandlers = new Map<string, FrontendActionHandler>();

export const registerFrontendActionHandler = (
    action: string,
    handler: FrontendActionHandler,
) => {
    frontendActionHandlers.set(action, handler);

    return () => {
        if (frontendActionHandlers.get(action) === handler) {
            frontendActionHandlers.delete(action);
        }
    };
};

export const getFrontendActionHandler = (action: string) =>
    frontendActionHandlers.get(action);
