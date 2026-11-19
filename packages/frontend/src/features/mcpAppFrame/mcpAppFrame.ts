import {
    resolveMcpAppParentOrigin,
    type McpAppFrameMessage,
    type McpAppFrameRequest,
} from './mcpAppFrameProtocol';

const isInFrame = () => {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
};

let parentOrigin: string | null | undefined;

export const getMcpAppParentOrigin = (): string | null => {
    if (parentOrigin === undefined) {
        try {
            parentOrigin = resolveMcpAppParentOrigin({
                search: window.location.search,
                storage: window.sessionStorage,
                isFramed: isInFrame(),
            });
        } catch {
            parentOrigin = null;
        }
    }
    return parentOrigin;
};

export const isMcpAppFrame = () => getMcpAppParentOrigin() !== null;

export const postToMcpAppParent = (message: McpAppFrameMessage) => {
    const origin = getMcpAppParentOrigin();
    if (origin) window.parent.postMessage(message, origin);
};

export type McpAppExplorerCommandHandler = (
    request: Exclude<McpAppFrameRequest, { command: 'navigate' }>,
) => Promise<unknown>;

let explorerCommandHandler: McpAppExplorerCommandHandler | null = null;

export const registerMcpAppExplorerCommandHandler = (
    handler: McpAppExplorerCommandHandler,
) => {
    explorerCommandHandler = handler;
    return () => {
        if (explorerCommandHandler === handler) explorerCommandHandler = null;
    };
};

export const getMcpAppExplorerCommandHandler = () => explorerCommandHandler;
