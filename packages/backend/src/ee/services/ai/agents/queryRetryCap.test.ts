import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
    buildQueryRetryStepOverride,
    DEEP_RESEARCH_RESOURCE_RECOVERY_ATTEMPTS,
    INVALID_INPUT_CAP,
    QUERY_TOOL_NAMES,
    REPEATED_QUERY_ERROR_CAP,
    WAREHOUSE_ERROR_CAP,
    WAREHOUSE_SLOW_CAP,
} from './queryRetryCap';

const QUERY_TOOLS = [...QUERY_TOOL_NAMES];
const NON_QUERY_TOOL = 'grepFields';
const ALL_TOOLS = [...QUERY_TOOLS, NON_QUERY_TOOL];

/**
 * Simulates a turn the way the agent loop sees it: tool results accumulate in
 * the model messages, and invalid tool calls are recorded by id (as
 * agentV2's onStepFinish/onChunk handlers do) — never derived from the error
 * text.
 */
const makeTurn = () => {
    const messages: ModelMessage[] = [];
    const invalidToolCallIds = new Set<string>();
    let idCounter = 0;

    const addResult = (
        toolName: string,
        output: { type: string; value: string },
    ) => {
        idCounter += 1;
        const toolCallId = `call-${idCounter}`;
        messages.push({
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId, toolName, output }],
        } as unknown as ModelMessage);
        return toolCallId;
    };

    return {
        success: (toolName = 'runQuery') =>
            addResult(toolName, { type: 'text', value: 'Total\n42' }),
        failure: (toolName = 'runQuery', value = 'Error running query. Boom') =>
            addResult(toolName, { type: 'error-text', value }),
        invalidInput: (
            toolName = 'generateVisualization',
            value = 'the SDK wording for a dropped call, which we must not depend on',
        ) => {
            const toolCallId = addResult(toolName, {
                type: 'error-text',
                value,
            });
            invalidToolCallIds.add(toolCallId);
            return toolCallId;
        },
        nextRound: () => {
            messages.push({
                role: 'assistant',
                content: [{ type: 'text', text: 'Trying a narrower query.' }],
            } as unknown as ModelMessage);
        },
        override: (executionMode: 'standard' | 'deep_research' = 'standard') =>
            buildQueryRetryStepOverride(
                messages,
                ALL_TOOLS,
                invalidToolCallIds,
                executionMode,
            ),
    };
};

const times = (n: number, fn: () => void) => {
    for (let i = 0; i < n; i += 1) fn();
};

describe('query retry cap', () => {
    it('never caps a turn of successful queries, however many', () => {
        const turn = makeTurn();
        times(10, () => turn.success());
        expect(turn.override()).toBeNull();
    });

    it('does not count successes toward the failure bounds', () => {
        const turn = makeTurn();
        times(10, () => turn.success());
        times(WAREHOUSE_ERROR_CAP - 1, () => turn.failure());
        expect(turn.override()).toBeNull();
    });

    it('ignores failures of non-query tools', () => {
        const turn = makeTurn();
        times(WAREHOUSE_ERROR_CAP, () =>
            turn.failure(NON_QUERY_TOOL, 'Error running query. Timed out'),
        );
        expect(turn.override()).toBeNull();
    });

    it('removes the query tools once warehouse failures hit their bound', () => {
        const turn = makeTurn();
        times(WAREHOUSE_ERROR_CAP, () => turn.failure());
        const override = turn.override();
        expect(override?.activeTools).toEqual([NON_QUERY_TOOL]);
        expect(override?.nudge.toLowerCase()).toContain('do not run it again');
    });

    it('stops Deep Research after the same runtime query error repeats', () => {
        const turn = makeTurn();
        times(REPEATED_QUERY_ERROR_CAP, () =>
            turn.failure(
                'generateVisualization',
                'Error running query. Unknown field orders_is_corrupted',
            ),
        );

        const override = turn.override('deep_research');

        expect(override?.activeTools).toEqual([NON_QUERY_TOOL]);
        expect(override?.nudge).toContain('Unknown field orders_is_corrupted');
        expect(override?.nudge).toContain('same query error repeated');
    });

    it('leaves standard runs on the existing aggregate retry cap', () => {
        const turn = makeTurn();
        times(REPEATED_QUERY_ERROR_CAP, () =>
            turn.failure(
                'generateVisualization',
                'Error running query. Unknown field orders_is_corrupted',
            ),
        );

        expect(turn.override('standard')).toBeNull();
    });

    it('resets the repeated error count after a successful query', () => {
        const turn = makeTurn();
        turn.failure(
            'generateVisualization',
            'Error running query. Unknown field orders_is_corrupted',
        );
        turn.success('generateVisualization');
        turn.failure(
            'generateVisualization',
            'Error running query. Unknown field orders_is_corrupted',
        );

        expect(turn.override('deep_research')).toBeNull();
    });

    it('keeps Deep Research query tools for distinct repair errors', () => {
        const turn = makeTurn();
        times(REPEATED_QUERY_ERROR_CAP, () =>
            turn.failure(
                'generateVisualization',
                `Error running query. Unknown field attempt-${crypto.randomUUID()}`,
            ),
        );

        expect(turn.override('deep_research')).toBeNull();
    });

    it('trips sooner on repeated warehouse timeouts', () => {
        const turn = makeTurn();
        times(WAREHOUSE_SLOW_CAP, () =>
            turn.failure(
                'runQuery',
                'Error running query. Query polling timed out after 300000ms',
            ),
        );
        const override = turn.override();
        expect(override?.activeTools).toEqual([NON_QUERY_TOOL]);
    });

    it('quotes the warehouse error in the give-up nudge, without the retry-encouraging wrapper', () => {
        const turn = makeTurn();
        times(WAREHOUSE_ERROR_CAP, () =>
            turn.failure(
                'runSql',
                'Error running SQL query. Access Denied: User does not have permission to query table my-project:dataset.orders\n\nTry again if you believe the error can be resolved.',
            ),
        );
        const override = turn.override();
        expect(override?.nudge).toContain(
            'Access Denied: User does not have permission to query table',
        );
        expect(override?.nudge).not.toContain('Try again if you believe');
        expect(override?.nudge.toLowerCase()).toContain(
            'relay this warehouse error',
        );
    });

    it('never removes the query tools for validation failures, however many', () => {
        const turn = makeTurn();
        times(INVALID_INPUT_CAP + 3, () => turn.invalidInput());
        const override = turn.override();
        expect(override?.activeTools).toEqual(ALL_TOOLS);
    });

    it('does not count validation failures toward the warehouse bound', () => {
        const turn = makeTurn();
        times(WAREHOUSE_ERROR_CAP, () => turn.invalidInput());
        expect(turn.override()).toBeNull();
    });

    it('classifies by recorded call id, not by error text', () => {
        // An invalid call whose SDK message happens to read like a warehouse
        // timeout must still count as a validation failure.
        const turn = makeTurn();
        times(WAREHOUSE_SLOW_CAP, () =>
            turn.invalidInput(
                'generateVisualization',
                'input dropped: the query timed out while validating',
            ),
        );
        expect(turn.override()).toBeNull();
    });

    it('steers a sustained validation loop toward correcting the input, with tools kept', () => {
        const turn = makeTurn();
        times(INVALID_INPUT_CAP - 1, () => turn.invalidInput());
        expect(turn.override()).toBeNull();

        turn.invalidInput();
        const override = turn.override();
        expect(override?.activeTools).toEqual(ALL_TOOLS);
        expect(override?.nudge.toLowerCase()).toContain('schema validation');
        expect(override?.nudge.toLowerCase()).toContain('fix the structure');
    });

    it('gives up rather than steers when warehouse failures also hit their bound', () => {
        const turn = makeTurn();
        times(INVALID_INPUT_CAP, () => turn.invalidInput());
        times(WAREHOUSE_ERROR_CAP, () => turn.failure());
        const override = turn.override();
        expect(override?.activeTools).toEqual([NON_QUERY_TOOL]);
    });

    it('quotes the last warehouse error in the give-up nudge even when a validation failure came after it', () => {
        const turn = makeTurn();
        times(WAREHOUSE_ERROR_CAP, () =>
            turn.failure(
                'runQuery',
                'Error running query. Access Denied: no permission on table orders',
            ),
        );
        turn.invalidInput(
            'generateVisualization',
            'SDK wording for the dropped call',
        );
        const override = turn.override();
        expect(override?.nudge).toContain('Access Denied: no permission');
        expect(override?.nudge).not.toContain(
            'SDK wording for the dropped call',
        );
    });

    it('keeps query tools available for a narrowed deep research recovery', () => {
        const turn = makeTurn();
        times(3, () =>
            turn.failure(
                'runQuery',
                'BigQuery error: bytesBilledLimitExceeded. Query exceeded limit for bytes billed.',
            ),
        );

        const override = turn.override('deep_research');

        expect(override?.activeTools).toEqual(ALL_TOOLS);
        expect(override?.markerKey).toBe('resource-recovery-1');
        expect(override?.nudge).toContain('Recovery attempt 1 of 2');
        expect(override?.nudge).toContain(
            'Do not repeat the same query unchanged',
        );
        expect(override?.nudge).toContain('narrowing the date range');
    });

    it('counts parallel resource failures as one recovery round', () => {
        const turn = makeTurn();
        times(3, () =>
            turn.failure('runQuery', 'Query exceeded limit for bytes billed.'),
        );

        expect(turn.override('deep_research')?.markerKey).toBe(
            'resource-recovery-1',
        );
    });

    it('allows two changed recovery rounds before using partial evidence', () => {
        const turn = makeTurn();
        for (
            let round = 0;
            round < DEEP_RESEARCH_RESOURCE_RECOVERY_ATTEMPTS;
            round += 1
        ) {
            turn.failure(
                'runSql',
                'Warehouse resource exhausted: memory limit exceeded.',
            );
            expect(turn.override('deep_research')?.activeTools).toEqual(
                ALL_TOOLS,
            );
            turn.nextRound();
        }
        turn.failure(
            'runSql',
            'Warehouse resource exhausted: memory limit exceeded.',
        );

        const override = turn.override('deep_research');

        expect(override?.activeTools).toEqual([NON_QUERY_TOOL]);
        expect(override?.markerKey).toBe('resource-recovery-exhausted');
        expect(override?.nudge).toContain('verified evidence already gathered');
        expect(override?.nudge).toContain(
            'Do not fail the whole research run when useful evidence remains',
        );
    });

    it('stops recovery guidance after a successful changed query', () => {
        const turn = makeTurn();
        turn.failure('runQuery', 'Query exceeded limit for bytes billed.');
        turn.nextRound();
        turn.success();

        expect(turn.override('deep_research')).toBeNull();

        turn.nextRound();
        turn.failure(
            'runQuery',
            'Query exceeded limit for bytes billed on different evidence.',
        );
        expect(turn.override('deep_research')?.markerKey).toBe(
            'resource-recovery-1',
        );
    });
});
