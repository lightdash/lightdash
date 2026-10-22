import { stampToolArgsVersion } from './stampToolArgsVersion';
import { TOOL_COMPOSER_QUERIES_ARGS_VERSION } from './toolComposerQueryArgs';
import { TOOL_VISUALIZE_ARGS_VERSION } from './toolVisualizeArgs';

describe('stampToolArgsVersion', () => {
    it('stamps the current version on query args', () => {
        expect(stampToolArgsVersion('query', { queries: [] })).toEqual({
            queries: [],
            version: TOOL_COMPOSER_QUERIES_ARGS_VERSION,
        });
    });

    it('stamps the current version on visualize args', () => {
        expect(stampToolArgsVersion('visualize', { nodeId: 'a' })).toEqual({
            nodeId: 'a',
            version: TOOL_VISUALIZE_ARGS_VERSION,
        });
    });

    it('leaves other tools unstamped', () => {
        expect(stampToolArgsVersion('runQuery', { a: 1 })).toEqual({ a: 1 });
    });
});
