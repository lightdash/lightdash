import { getFields, getItemId } from '@lightdash/common';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiAgentUnknownFieldsError } from '../utils/AiAgentUnknownFieldsError';
import { AiDecisionClient } from './AiDecisionClient';
import { suggestSemanticFields } from './fieldRecovery';

const error = () =>
    new AiAgentUnknownFieldsError('Invalid fields', validExplore, [
        'total_sales',
    ]);
const setup = () => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    return { decisions, evaluate: vi.spyOn(decisions, 'evaluate') };
};

describe('semantic field recovery', () => {
    it('suggests a known alias without changing the query or including SQL', async () => {
        const { decisions, evaluate } = setup();
        evaluate.mockImplementation(async ({ questions }) => {
            const question = questions.field_0;
            if (question.type !== 'choice') throw new Error('Expected choice');
            const choice = Object.entries(question.criteria).find(
                ([, value]) => value === 'a_met1',
            )![0];
            return {
                field_0: {
                    type: 'choice',
                    choice,
                    confidence: 0.99,
                    probabilities: { [choice]: 1 },
                },
            };
        });
        const original = structuredClone(validExplore);
        expect(
            await suggestSemanticFields({
                decisions,
                error: error(),
                question: 'What are total sales?',
            }),
        ).toContain('"total_sales" → "a_met1"');
        expect(validExplore).toEqual(original);
        const { state, questions } = evaluate.mock.calls[0][0];
        expect(JSON.stringify(state)).not.toContain('compiledSql');
        expect(questions.field_0).toMatchObject({
            criteria: { none: expect.any(String) },
        });
    });

    it.each(['none', '999', 'low', 'outage'])(
        'preserves original error without suggestions for %s',
        async (scenario) => {
            const { decisions, evaluate } = setup();
            const choice = scenario === 'low' ? '0' : scenario;
            evaluate.mockResolvedValue(
                scenario === 'outage'
                    ? null
                    : {
                          field_0: {
                              type: 'choice',
                              choice,
                              confidence: scenario === 'low' ? 0.5 : 0.99,
                              probabilities: { [choice]: 1 },
                          },
                      },
            );
            expect(
                await suggestSemanticFields({
                    decisions,
                    error: error(),
                    question: 'Sales',
                }),
            ).toBe('');
        },
    );

    it('batches missing IDs and bounds candidates and questions for wide explores', async () => {
        const { decisions, evaluate } = setup();
        evaluate.mockResolvedValue(null);
        const fields = getFields(validExplore);
        const dimension = Object.values(validExplore.tables.a.dimensions)[0];
        const wide = {
            ...validExplore,
            tables: {
                a: {
                    ...validExplore.tables.a,
                    dimensions: Object.fromEntries(
                        Array.from({ length: 400 }, (_, index) => [
                            `dimension_${index}`,
                            { ...dimension, name: `dimension_${index}` },
                        ]),
                    ),
                },
            },
        };
        const invalid = new AiAgentUnknownFieldsError('Invalid fields', wide, [
            'one',
            'two',
            'three',
            'four',
            'five',
            'one',
        ]);
        await suggestSemanticFields({
            decisions,
            error: invalid,
            question: fields.map(getItemId).join(' '),
        });
        const { questions } = evaluate.mock.calls[0][0];
        expect(Object.keys(questions)).toHaveLength(4);
        for (const question of Object.values(questions)) {
            expect(question.type).toBe('choice');
            if (question.type === 'choice')
                expect(Object.keys(question.criteria)).toHaveLength(81);
        }
    });
});
