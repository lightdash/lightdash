import {
    toolGenerateUiOutputSchema,
    type GenerativeUiActionOutcome,
} from '@lightdash/common';
import {
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    invalidSpecMock,
    moveChartsOutcomesMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { getGenerativeUiApiCatalog } from '../generativeUi/apiOperationCatalog';
import { getGenerateUi } from './generateUi';

const toolFor = (outcome: GenerativeUiActionOutcome | null) =>
    getGenerateUi({
        catalog: getGenerativeUiApiCatalog(),
        projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
        findToolUserInput: vi.fn(async () =>
            outcome === null
                ? null
                : { toolName: 'generateUi', input: outcome },
        ),
    });

const options = { messages: [], toolCallId: 'tool-call-1', context: {} };

const run = async (
    tool: ReturnType<typeof getGenerateUi>,
    spec: typeof moveChartsSpecMock,
) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(spec, options);
    expect(toolGenerateUiOutputSchema.safeParse(output).success).toBe(true);
    return toolGenerateUiOutputSchema.parse(output);
};

const needsApproval = async (
    tool: ReturnType<typeof getGenerateUi>,
    spec: typeof moveChartsSpecMock,
) => {
    if (typeof tool.needsApproval !== 'function') {
        throw new Error('tool has no approval check');
    }
    return tool.needsApproval(spec, options);
};

describe('generateUi', () => {
    it('halts for a valid card and runs at once for an invalid one', async () => {
        expect(await needsApproval(toolFor(null), moveChartsSpecMock)).toBe(
            true,
        );
        expect(await needsApproval(toolFor(null), invalidSpecMock)).toBe(false);
    });

    it('returns every problem of an invalid card', async () => {
        const output = await run(toolFor(null), invalidSpecMock);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('The card was not shown:');
        expect(output.result).toContain(
            '"updateSavedChart" is not an operation',
        );
        expect(output.result).toContain('projectUuid is filled in');
    });

    it('refuses to invent an outcome when none was recorded', async () => {
        const output = await run(toolFor(null), moveChartsSpecMock);

        expect(output).toEqual({
            result: 'No outcome was recorded for this card. Do not render it again unless the user asks.',
            metadata: { status: 'error' },
            structuredContent: {
                error: 'No outcome was recorded for this card. Do not render it again unless the user asks.',
            },
        });
    });

    it.each(Object.values(moveChartsOutcomesMock))(
        'returns the recorded $status outcome',
        async (outcome) => {
            const output = await run(toolFor(outcome), moveChartsSpecMock);

            expect(output.metadata).toEqual({
                status: outcome.status,
                state: outcome.state,
            });
            expect(output.structuredContent).toEqual(outcome);
        },
    );
});
