import { z } from 'zod';
import { checkAnsweredTurn } from '../lib/agentTurn';
import { askInNewThread, assistantBubbles, errorToasts } from '../lib/agentUi';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { attachJson, reportObservation } from '../lib/report';
import { STREAM_KINDS } from '../lib/stream';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T2.2. V on tool use, D on stream completion: a stream that ends in an
// error part, or a bubble that never resolves, is real.
// Preconditions: F1. Plan §4 "var": run this same spec against a backend
// with *_SUPPORTS_STREAMING=false for the non-streaming transport.

// AiPromptResponseTiming, written by the agent for streamed turns.
const responseTimingSchema = z.object({
    startedAt: z.string(),
    firstTokenAt: z.string().nullable(),
    finishedAt: z.string(),
    stages: z.looseObject({ providerMs: z.number().nullable() }).optional(),
});

// A tool call streams from tool-input-start, or arrives whole as
// tool-input-available when streaming is simulated.
const TOOL_PART_TYPES = [
    STREAM_KINDS.toolInputStart,
    STREAM_KINDS.toolInputAvailable,
];

/**
 * Reported, never asserted: the operator chooses the transport. Under
 * simulated streaming the first chunk only follows a whole provider call, so
 * it lands near the average provider time per step.
 */
const describeFirstChunk = (
    firstChunkMs: number,
    providerMs: number | null,
    partTypes: string[],
) => {
    const steps = partTypes.filter(
        (type) => type === STREAM_KINDS.startStep,
    ).length;
    const toolInputStreamed = partTypes.some(
        (type) =>
            type === STREAM_KINDS.toolInputStart ||
            type === STREAM_KINDS.toolInputDelta,
    );
    const perStep =
        providerMs === null || steps === 0
            ? 'provider time per step unavailable'
            : `${Math.round(providerMs / steps)} ms average provider time per step over ${steps} step(s): ${
                  firstChunkMs >= (0.5 * providerMs) / steps
                      ? 'close, as when streaming is simulated (firstTokenAt then means first step completed)'
                      : 'well below, as when the provider streams'
              }`;
    return `first chunk after ${firstChunkMs} ms vs ${perStep}; tool input ${toolInputStreamed ? 'streamed incrementally' : 'arrived whole'}`;
};

test('T2.2 Streaming answer in the browser', async ({ page, db, f1Agent }) => {
    await retryOnceOnVariance(async (attemptNumber) => {
        const { thread, streamStatus, partTypes } = await askInNewThread(
            page,
            f1Agent,
            WITNESS_PROMPTS.totalOrders,
        );
        await attachJson(
            `attempt ${attemptNumber} stream part types`,
            partTypes,
        );

        expect(streamStatus, 'stream status').toBe(200);
        await expect(errorToasts(page), 'error toasts').toHaveCount(0);
        await expect(assistantBubbles(page).last()).toHaveText(/\S/);
        expect(partTypes, 'stream error parts').not.toContain(
            STREAM_KINDS.error,
        );
        expect(partTypes, 'stream text parts').toContain(
            STREAM_KINDS.textDelta,
        );

        const { verdict, ledger } = await checkAnsweredTurn(
            db,
            thread.firstMessage.uuid,
        );
        const timing = responseTimingSchema.parse(
            ledger.prompt.response_timing,
        );
        if (timing.firstTokenAt === null) {
            throw new Error(
                'response_timing.firstTokenAt is null for a streamed turn',
            );
        }
        const startedAt = Date.parse(timing.startedAt);
        const firstChunkMs = Date.parse(timing.firstTokenAt) - startedAt;
        expect(firstChunkMs, 'time to first chunk vs total').toBeLessThan(
            Date.parse(timing.finishedAt) - startedAt,
        );
        reportObservation(
            describeFirstChunk(
                firstChunkMs,
                timing.stages?.providerMs ?? null,
                partTypes,
            ),
        );

        if (
            !partTypes.some((type) =>
                TOOL_PART_TYPES.some((kind) => kind === type),
            )
        ) {
            return {
                kind: 'variance',
                assertion: 'the stream carried no tool part',
                ledger: { partTypes, ledger },
            };
        }
        return verdict;
    });
});
