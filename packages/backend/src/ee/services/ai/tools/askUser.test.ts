import { toolAskUserOutputSchema, type AiPrompt } from '@lightdash/common';
import { canOfferAskUser, getAskUser, withAskUserQuestions } from './askUser';

const questions = [
    {
        header: 'Period',
        question: 'Which month should I use?',
        options: [
            { label: 'November 2022', description: 'Latest full month' },
            { label: 'October 2022', description: 'Previous month' },
        ],
        multiSelect: false,
    },
];
const askCall = { toolName: 'askUser', input: { questions } };

describe('askUser', () => {
    it('returns the structured output contract', async () => {
        const output = await getAskUser().execute!(
            { questions },
            { messages: [], toolCallId: 'ask', context: {} },
        );
        expect(toolAskUserOutputSchema.safeParse(output).success).toBe(true);
    });

    it('keeps the question in the reply after the model text', () => {
        expect(withAskUserQuestions('', [askCall])).toBe(
            'Which month should I use?',
        );
        expect(withAskUserQuestions('Two months fit.', [askCall])).toBe(
            'Two months fit.\n\nWhich month should I use?',
        );
        expect(
            withAskUserQuestions('Which month should I use?', [askCall]),
        ).toBe('Which month should I use?');
    });

    it('leaves the reply alone without a valid askUser call', () => {
        expect(
            withAskUserQuestions('Answer', [
                { toolName: 'askUser', input: { questions: [] } },
                { toolName: 'runQuery', input: { questions } },
            ]),
        ).toBe('Answer');
    });
});

describe('canOfferAskUser', () => {
    const webPrompt = {
        threadCreatedFrom: 'web_app',
        battleProfile: null,
    } as AiPrompt;

    it('offers the tool on a standard web app turn', () => {
        expect(canOfferAskUser(webPrompt, 'standard')).toBe(true);
    });

    it.each([
        ['an api thread', { ...webPrompt, threadCreatedFrom: 'api' }],
        ['a Slack prompt', { ...webPrompt, slackUserId: 'U1' }],
        ['a Battle thread', { ...webPrompt, battleProfile: 'fast' }],
    ])('withholds it from %s', (_, prompt) => {
        expect(canOfferAskUser(prompt as AiPrompt, 'standard')).toBe(false);
    });

    it('withholds it from deep research', () => {
        expect(canOfferAskUser(webPrompt, 'deep_research')).toBe(false);
    });
});
