import {
    QuerySurface,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import { querySurfaceFromPrompt } from './querySurface';

describe('querySurfaceFromPrompt', () => {
    it.each(['slack', 'web_app', 'api'] as const)(
        'attributes a Slack prompt in a %s thread to Slack',
        (threadCreatedFrom) => {
            expect(
                querySurfaceFromPrompt({
                    threadCreatedFrom,
                    slackUserId: 'U1',
                } as SlackPrompt),
            ).toBe(QuerySurface.SLACK);
        },
    );

    it.each([
        ['api', QuerySurface.API],
        ['web_app', QuerySurface.APP],
        ['scheduler', QuerySurface.APP],
        ['evals', QuerySurface.APP],
        ['data_app', QuerySurface.APP],
    ] as const)(
        'attributes a %s web prompt to %s',
        (threadCreatedFrom, surface) => {
            expect(
                querySurfaceFromPrompt({ threadCreatedFrom } as AiWebAppPrompt),
            ).toBe(surface);
        },
    );
});
