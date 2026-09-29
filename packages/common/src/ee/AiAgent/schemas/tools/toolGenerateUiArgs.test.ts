import {
    deleteWithConfirmSpecMock,
    dependentQuerySpecMock,
    everyBlockSpecMock,
    forEachChainSpecMock,
    invalidSpecMock,
    moveChartsOutcomesMock,
    moveChartsSpecMock,
    moveChartsSubmissionsMock,
    staticRowsSpecMock,
} from '../../generativeUi/generativeUiSpec.mock';
import { createAgentInputSchema } from '../agentInputSchema';
import {
    GENERATIVE_UI_LIMITS,
    generativeUiActionOutcomeSchema,
    generativeUiActionSubmissionSchema,
    generativeUiStateSchema,
    parseGenerativeUiRef,
    TOOL_GENERATE_UI_DESCRIPTION,
    toolGenerateUiArgsSchema,
    toolGenerateUiOutputSchema,
    type GenerativeUiBlock,
} from './toolGenerateUiArgs';

const specMocks = {
    moveChartsSpecMock,
    everyBlockSpecMock,
    dependentQuerySpecMock,
    forEachChainSpecMock,
    deleteWithConfirmSpecMock,
    staticRowsSpecMock,
    invalidSpecMock,
};

const minimalSpec = {
    version: 1,
    title: 'Validate',
    blocks: [{ type: 'divider' }],
    action: {
        label: 'Validate',
        steps: [{ id: 'validate', operationId: 'ValidateProject' }],
    },
};

const parses = (spec: unknown) =>
    toolGenerateUiArgsSchema.safeParse(spec).success;

const blockTypesOf = (blocks: GenerativeUiBlock[]): string[] =>
    blocks.flatMap((block) => {
        switch (block.type) {
            case 'stack':
            case 'group':
                return [block.type, ...blockTypesOf(block.children)];
            default:
                return [block.type];
        }
    });

describe('toolGenerateUiArgsSchema', () => {
    it.each(Object.entries(specMocks))('parses %s unchanged', (_name, spec) => {
        expect(toolGenerateUiArgsSchema.parse(spec)).toEqual(spec);
    });

    it('covers every block type in the every-block fixture', () => {
        expect(new Set(blockTypesOf(everyBlockSpecMock.blocks)).size).toBe(15);
    });

    it(`nests blocks at most ${GENERATIVE_UI_LIMITS.maxDepth} deep`, () => {
        const stack = (child: unknown) => ({
            type: 'stack',
            children: [child],
        });
        const deepest = stack(stack(stack({ type: 'divider' })));

        expect(parses({ ...minimalSpec, blocks: [deepest] })).toBe(true);
        expect(parses({ ...minimalSpec, blocks: [stack(deepest)] })).toBe(
            false,
        );
    });

    it('rejects unknown keys, block types and malformed identifiers', () => {
        expect(
            parses({
                ...minimalSpec,
                blocks: [{ type: 'heading', text: 'Hi', style: 'bold' }],
            }),
        ).toBe(false);
        expect(
            parses({
                ...minimalSpec,
                blocks: [{ type: 'markdown', text: 'x' }],
            }),
        ).toBe(false);
        expect(
            parses({
                ...minimalSpec,
                blocks: [
                    { type: 'textInput', key: 'space uuid', label: 'Space' },
                ],
            }),
        ).toBe(false);
        expect(parses({ ...minimalSpec, extra: true })).toBe(false);
    });

    it('enforces the size limits', () => {
        const step = { id: 'validate', operationId: 'ValidateProject' };
        const tooManySteps = Array.from(
            { length: GENERATIVE_UI_LIMITS.maxSteps + 1 },
            (_, index) => ({ ...step, id: `step${index}` }),
        );
        const tooManyColumns = Array.from(
            { length: GENERATIVE_UI_LIMITS.maxColumns + 1 },
            (_, index) => ({ key: `column${index}`, label: `Column ${index}` }),
        );

        expect(
            parses({
                ...minimalSpec,
                title: 'x'.repeat(GENERATIVE_UI_LIMITS.maxStringLength + 1),
            }),
        ).toBe(false);
        expect(
            parses({
                ...minimalSpec,
                action: { label: 'Go', steps: tooManySteps },
            }),
        ).toBe(false);
        expect(
            parses({
                ...minimalSpec,
                blocks: [{ type: 'table', rows: [], columns: tooManyColumns }],
            }),
        ).toBe(false);
    });
});

describe('parseGenerativeUiRef', () => {
    it('reads each reference kind', () => {
        expect(parseGenerativeUiRef({ $state: 'spaceUuid' })).toEqual({
            kind: 'state',
            key: 'spaceUuid',
        });
        expect(
            parseGenerativeUiRef({ $query: 'spaces', path: '0.uuid' }),
        ).toEqual({ kind: 'query', queryId: 'spaces', path: '0.uuid' });
        expect(parseGenerativeUiRef({ $result: 'createSpace' })).toEqual({
            kind: 'result',
            stepId: 'createSpace',
            path: '',
        });
        expect(parseGenerativeUiRef({ $item: '' })).toEqual({
            kind: 'item',
            path: '',
        });
    });

    it('returns null for anything else, including refs with extra keys', () => {
        expect(parseGenerativeUiRef({ $state: 'a', equals: 1 })).toBeNull();
        expect(parseGenerativeUiRef({ name: 'Finance' })).toBeNull();
        expect(parseGenerativeUiRef(['$state'])).toBeNull();
        expect(parseGenerativeUiRef('$state')).toBeNull();
        expect(parseGenerativeUiRef(null)).toBeNull();
    });
});

describe('generateUi tool input schema', () => {
    const inputSchema = createAgentInputSchema(toolGenerateUiArgsSchema);

    it('serialises for the model within 16 KB', async () => {
        const jsonSchema = await inputSchema.jsonSchema;

        expect(
            Buffer.byteLength(JSON.stringify(jsonSchema)),
        ).toBeLessThanOrEqual(16 * 1024);
    });

    it('validates tool input with the zod schema', async () => {
        expect(await inputSchema.validate?.(moveChartsSpecMock)).toEqual({
            success: true,
            value: moveChartsSpecMock,
        });
    });
});

describe('TOOL_GENERATE_UI_DESCRIPTION', () => {
    it('lists every block type with its fields', () => {
        new Set(blockTypesOf(everyBlockSpecMock.blocks)).forEach((type) =>
            expect(TOOL_GENERATE_UI_DESCRIPTION).toContain(`\n- ${type}(`),
        );
        expect(TOOL_GENERATE_UI_DESCRIPTION).toContain(
            '- table(rows, columns, selectable?)',
        );
    });

    it('explains every reference kind', () => {
        ['$state', '$query', '$result', '$item'].forEach((kind) =>
            expect(TOOL_GENERATE_UI_DESCRIPTION).toContain(`{"${kind}"`),
        );
    });

    it('stays under 4 KB', () => {
        expect(TOOL_GENERATE_UI_DESCRIPTION.length).toBeLessThanOrEqual(4096);
    });
});

describe('outcome schemas', () => {
    it.each(Object.entries(moveChartsSubmissionsMock))(
        'parses a %s submission',
        (_status, submission) => {
            expect(
                generativeUiActionSubmissionSchema.parse(submission),
            ).toEqual(submission);
        },
    );

    it('rejects a failed submission without the failure', () => {
        const { failure: _failure, ...withoutFailure } =
            moveChartsSubmissionsMock.failed;

        expect(
            generativeUiActionSubmissionSchema.safeParse(withoutFailure)
                .success,
        ).toBe(false);
    });

    it.each(Object.entries(moveChartsOutcomesMock))(
        'parses a %s outcome',
        (_status, outcome) => {
            expect(generativeUiActionOutcomeSchema.parse(outcome)).toEqual(
                outcome,
            );
        },
    );

    it('wraps outcomes and errors in the tool output envelope', () => {
        const { success, failed, dismissed } = moveChartsOutcomesMock;
        const outputs = [
            {
                result: 'Moved 2 charts.',
                metadata: { status: 'success', state: success.state },
                structuredContent: success,
            },
            {
                result: 'Moving the second chart failed.',
                metadata: { status: 'failed', state: failed.state },
                structuredContent: failed,
            },
            {
                result: 'The user dismissed the card.',
                metadata: { status: 'dismissed', state: dismissed.state },
                structuredContent: dismissed,
            },
            {
                result: 'The spec was rejected.',
                metadata: { status: 'error' },
                structuredContent: { error: 'The spec was rejected.' },
            },
        ];

        outputs.forEach((output) =>
            expect(toolGenerateUiOutputSchema.parse(output)).toEqual(output),
        );
        expect(
            toolGenerateUiOutputSchema.safeParse({
                ...outputs[0],
                metadata: { status: 'success' },
            }).success,
        ).toBe(false);
    });

    it('never pairs a status with another status content', () => {
        const { success, failed } = moveChartsOutcomesMock;

        expect(
            toolGenerateUiOutputSchema.safeParse({
                result: 'The spec was rejected.',
                metadata: { status: 'error' },
                structuredContent: success,
            }).success,
        ).toBe(false);
        expect(
            toolGenerateUiOutputSchema.safeParse({
                result: 'Moved 2 charts.',
                metadata: { status: 'success', state: success.state },
                structuredContent: failed,
            }).success,
        ).toBe(false);
    });

    it('keeps numeric row ids in state as numbers', () => {
        const state = { schedulerIds: [42, 'a1b2'], name: 'Weekly' };

        expect(generativeUiStateSchema.parse(state)).toEqual(state);
    });
});
