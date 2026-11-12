import { toolAskUserOutputSchema } from '@lightdash/common';
import { getAskUser, withAskUserQuestions } from './askUser';

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
