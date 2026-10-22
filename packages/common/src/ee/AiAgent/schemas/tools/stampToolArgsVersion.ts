import { TOOL_COMPOSER_QUERIES_ARGS_VERSION } from './toolComposerQueryArgs';
import { TOOL_VISUALIZE_ARGS_VERSION } from './toolVisualizeArgs';

/** Stamps the current args version on tools whose persisted args are versioned. */
export const stampToolArgsVersion = (
    toolName: string,
    toolArgs: object,
): object => {
    switch (toolName) {
        case 'query':
            return { ...toolArgs, version: TOOL_COMPOSER_QUERIES_ARGS_VERSION };
        case 'visualize':
            return { ...toolArgs, version: TOOL_VISUALIZE_ARGS_VERSION };
        default:
            return toolArgs;
    }
};
