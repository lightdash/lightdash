import type { AiWebAppPrompt, SlackPrompt } from '@lightdash/common';
import { getPromptUsageAttribution } from './usageAttribution';

const webPrompt = (prompt: Partial<AiWebAppPrompt>) =>
    ({
        threadCreatedFrom: 'web_app',
        threadEmbedSpaceUuid: null,
        externalUserId: null,
        ...prompt,
    }) as AiWebAppPrompt;

describe('getPromptUsageAttribution', () => {
    it('attributes an embedded turn to the viewer who sent it', () => {
        expect(
            getPromptUsageAttribution(
                webPrompt({
                    threadEmbedSpaceUuid: 'space-1',
                    externalUserId: 'viewer-1',
                }),
            ),
        ).toEqual({ channel: 'embed', externalUserId: 'viewer-1' });
    });

    it('attributes a turn sent from the app to no viewer', () => {
        expect(getPromptUsageAttribution(webPrompt({}))).toEqual({
            channel: 'web',
            externalUserId: null,
        });
    });

    it('attributes a turn started through the API to no viewer', () => {
        expect(
            getPromptUsageAttribution(webPrompt({ threadCreatedFrom: 'api' })),
        ).toEqual({ channel: 'api', externalUserId: null });
    });

    it('attributes a Slack turn to no viewer', () => {
        expect(
            getPromptUsageAttribution({
                threadCreatedFrom: 'slack',
                slackUserId: 'U1',
            } as SlackPrompt),
        ).toEqual({ channel: 'slack', externalUserId: null });
    });
});
