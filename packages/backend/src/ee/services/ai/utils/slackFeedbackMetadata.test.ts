import { slackFeedbackModalMetadataSchema } from './slackFeedbackMetadata';

describe('slackFeedbackModalMetadataSchema', () => {
    it('accepts metadata from modals opened before Slack response locators existed', () => {
        expect(
            slackFeedbackModalMetadataSchema.parse({
                promptUuid: 'prompt-uuid',
            }),
        ).toEqual({
            promptUuid: 'prompt-uuid',
            slackChannelId: null,
            responseSlackTs: null,
            userUuid: null,
        });
    });

    it('accepts v3 response locators', () => {
        expect(
            slackFeedbackModalMetadataSchema.parse({
                promptUuid: 'prompt-uuid',
                slackChannelId: 'C123',
                responseSlackTs: '1767225600.000001',
                userUuid: null,
            }),
        ).toMatchObject({
            slackChannelId: 'C123',
            responseSlackTs: '1767225600.000001',
        });
    });
});
