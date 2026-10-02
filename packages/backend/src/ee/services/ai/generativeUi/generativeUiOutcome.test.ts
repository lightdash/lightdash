import {
    compileGenerativeUiSpec,
    ParameterError,
    toolGenerateUiOutputSchema,
    type GenerativeUiActionSubmission,
    type GenerativeUiCompiledSpec,
    type GenerativeUiSpec,
} from '@lightdash/common';
import {
    deleteWithConfirmSpecMock,
    forEachChainSpecMock,
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsByIdMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import {
    buildGenerativeUiOutcome,
    renderGenerativeUiOutcome,
    toGenerateUiToolOutput,
} from './generativeUiOutcome';

type FailedSubmission = Extract<
    GenerativeUiActionSubmission,
    { status: 'failed' }
>;
type Responses = FailedSubmission['responses'];

const compile = (spec: GenerativeUiSpec): GenerativeUiCompiledSpec => {
    const result = compileGenerativeUiSpec(spec, {
        operations: generativeUiOperationsByIdMock,
        projectUuid: GENERATIVE_UI_PROJECT_UUID_MOCK,
    });
    if (!result.ok) throw new Error(result.problems.join('\n'));
    return result.compiled;
};

const chain = compile(forEachChainSpecMock);
const state = { spaceName: 'Finance', chartUuids: ['c-1', 'c-2', 'c-3'] };
const createSpaceRequest = {
    operationId: 'CreateSpaceInProject',
    method: 'POST',
    pathTemplate: '/api/v1/projects/{projectUuid}/spaces',
};
const moveRequest = {
    operationId: 'Move content',
    method: 'POST',
    pathTemplate: '/api/v2/content/{projectUuid}/move',
};
const forbidden = {
    statusCode: 403,
    name: 'ForbiddenError',
    message: 'No access to this chart',
};

describe('buildGenerativeUiOutcome', () => {
    it('takes each request from the spec, not the browser', () => {
        expect(
            buildGenerativeUiOutcome(chain, {
                status: 'success',
                state,
                responses: {
                    createSpace: [{ uuid: 'space-new' }],
                    move: [null, null, null],
                },
            }),
        ).toEqual({
            status: 'success',
            state,
            steps: {
                createSpace: {
                    request: createSpaceRequest,
                    responses: [{ uuid: 'space-new' }],
                    truncated: false,
                },
                move: {
                    request: moveRequest,
                    responses: [null, null, null],
                    truncated: false,
                },
            },
        });
    });

    it('keeps what ran before a forEach item failed', () => {
        expect(
            buildGenerativeUiOutcome(chain, {
                status: 'failed',
                state,
                responses: {
                    createSpace: [{ uuid: 'space-new' }],
                    move: [null],
                },
                failure: { stepId: 'move', itemIndex: 1, error: forbidden },
            }),
        ).toEqual({
            status: 'failed',
            state,
            completed: {
                createSpace: {
                    request: createSpaceRequest,
                    responses: [{ uuid: 'space-new' }],
                    truncated: false,
                },
                move: {
                    request: moveRequest,
                    responses: [null],
                    truncated: false,
                },
            },
            failedStep: {
                id: 'move',
                itemIndex: 1,
                request: moveRequest,
                error: forbidden,
            },
        });
    });

    it('reports a failed single step without its empty responses', () => {
        const outcome = buildGenerativeUiOutcome(
            compile(deleteWithConfirmSpecMock),
            {
                status: 'failed',
                state: { spaceUuid: 's-1' },
                responses: { deleteSpace: [] },
                failure: {
                    stepId: 'deleteSpace',
                    itemIndex: null,
                    error: forbidden,
                },
            },
        );

        expect(outcome.status === 'failed' && outcome.completed).toEqual({});
    });

    it.each<{ name: string; responses: Responses }>([
        {
            name: 'an unknown step',
            responses: { createSpace: [{}], move: [], rename: [{}] },
        },
        {
            name: 'a single step with two responses',
            responses: { createSpace: [{}, {}], move: [] },
        },
        { name: 'a missing single step', responses: { move: [null] } },
    ])('rejects a success with $name', ({ responses }) => {
        expect(() =>
            buildGenerativeUiOutcome(chain, {
                status: 'success',
                state,
                responses,
            }),
        ).toThrow(ParameterError);
    });

    it.each<{
        name: string;
        failure: FailedSubmission['failure'];
        responses: Responses;
    }>([
        {
            name: 'an item index on a single step',
            failure: { stepId: 'createSpace', itemIndex: 0, error: forbidden },
            responses: {},
        },
        {
            name: 'a partial count that does not match the item index',
            failure: { stepId: 'move', itemIndex: 2, error: forbidden },
            responses: { createSpace: [{}], move: [null] },
        },
        {
            name: 'responses after the failing step',
            failure: {
                stepId: 'createSpace',
                itemIndex: null,
                error: forbidden,
            },
            responses: { move: [null] },
        },
        {
            name: 'an unknown failing step',
            failure: { stepId: 'rename', itemIndex: null, error: forbidden },
            responses: {},
        },
    ])('rejects a failure with $name', ({ failure, responses }) => {
        expect(() =>
            buildGenerativeUiOutcome(chain, {
                status: 'failed',
                state,
                responses,
                failure,
            }),
        ).toThrow(ParameterError);
    });

    it('cuts long responses and state down to size', () => {
        const outcome = buildGenerativeUiOutcome(chain, {
            status: 'success',
            state: { spaceName: 'x'.repeat(600), chartUuids: [] },
            responses: {
                createSpace: [
                    {
                        name: 'y'.repeat(600),
                        items: Array.from({ length: 30 }, (_, index) => index),
                    },
                ],
                move: [],
            },
        });

        if (outcome.status !== 'success') throw new Error('expected success');
        expect(outcome.state.spaceName).toHaveLength(500);
        expect(outcome.steps.createSpace.truncated).toBe(true);
        expect(outcome.steps.createSpace.responses).toEqual([
            {
                name: `${'y'.repeat(500)}…`,
                items: Array.from({ length: 20 }, (_, index) => index),
            },
        ]);
    });

    it('replaces a response that stays too large', () => {
        const wide = Object.fromEntries(
            Array.from({ length: 40 }, (_, index) => [
                `key${index}`,
                'z'.repeat(400),
            ]),
        );
        const outcome = buildGenerativeUiOutcome(chain, {
            status: 'success',
            state,
            responses: { createSpace: [wide], move: [] },
        });

        expect(
            outcome.status === 'success' && outcome.steps.createSpace,
        ).toMatchObject({
            responses: ['(response too large)'],
            truncated: true,
        });
    });
});

describe('generateUi tool output', () => {
    it.each<{
        status: GenerativeUiActionSubmission['status'];
        submission: GenerativeUiActionSubmission;
        text: string;
    }>([
        {
            status: 'success',
            submission: {
                status: 'success',
                state,
                responses: {
                    createSpace: [{ uuid: 'space-new' }],
                    move: [null],
                },
            },
            text: 'The user ran the card and every step succeeded.',
        },
        {
            status: 'failed',
            submission: {
                status: 'failed',
                state,
                responses: {
                    createSpace: [{ uuid: 'space-new' }],
                    move: [null],
                },
                failure: { stepId: 'move', itemIndex: 1, error: forbidden },
            },
            text: 'The user ran the card and step "move" (Move content) failed on item 2: 403 ForbiddenError: No access to this chart',
        },
        {
            status: 'dismissed',
            submission: { status: 'dismissed', state },
            text: 'The user skipped the card; nothing ran.',
        },
    ])(
        'renders a $status outcome as text and a valid output',
        ({ status, submission, text }) => {
            const outcome = buildGenerativeUiOutcome(chain, submission);
            const output = toGenerateUiToolOutput(outcome);

            expect(renderGenerativeUiOutcome(outcome).split('\n')[0]).toBe(
                text,
            );
            expect(output.metadata).toEqual({ status, state });
            expect(output.result).toBe(renderGenerativeUiOutcome(outcome));
            expect(toolGenerateUiOutputSchema.safeParse(output).success).toBe(
                true,
            );
        },
    );
});
