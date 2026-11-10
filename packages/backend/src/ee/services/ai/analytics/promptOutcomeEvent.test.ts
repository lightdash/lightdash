import { describe, expect, it } from 'vitest';
import {
    aiAgentPromptOutcomePropertiesSchema,
    summarizePromptOutcome,
    type PromptToolCall,
} from './promptOutcomeEvent';

const ok = (
    toolName: string,
    rowCount: number | null = 10,
): PromptToolCall => ({
    toolName,
    outcome: rowCount === 0 ? 'empty' : 'ok',
    errorCode: null,
    rowCount,
    detour: false,
});
const failed = (
    toolName: string,
    errorCode: PromptToolCall['errorCode'],
): PromptToolCall => ({
    toolName,
    outcome: 'error',
    errorCode,
    rowCount: null,
    detour: false,
});
const detour = (toolName: string): PromptToolCall => ({
    ...ok(toolName, null),
    detour: true,
});

const promptOutcomeFixtures = {
    gaveUpOnBytesBilledLimit: [
        failed('runComposerQueries', 'bigquery_bytes_billed_limit'),
        failed('runComposerQueries', 'bigquery_bytes_billed_limit'),
    ],
    recoveredFromRepeatedDuckdbBind: Array.from({ length: 5 }, () => [
        failed('runComposerQueries', 'duckdb_bind'),
        ok('runComposerQueries'),
    ]).flat(),
    detoursAfterNotFound: [
        failed('readContent', 'not_found'),
        detour('loadMcpTools'),
        detour('exploreRepo'),
        detour('exploreRepo'),
        detour('mcp_lightdash_docs__search_docs'),
        detour('mcp_lightdash_docs__search_docs'),
        detour('exploreRepo'),
    ],
} satisfies Record<string, PromptToolCall[]>;

describe('summarizePromptOutcome', () => {
    it('gives up after the same warehouse limit twice', () => {
        expect(
            summarizePromptOutcome(
                promptOutcomeFixtures.gaveUpOnBytesBilledLimit,
                [],
            ),
        ).toEqual({
            toolCalls: 2,
            failedToolCalls: 2,
            errorCodes: ['bigquery_bytes_billed_limit'],
            recovered: false,
            gaveUp: true,
            repeatedErrorCode: null,
            repeatedErrorCount: 0,
            detourCalls: 0,
            zeroRowQueries: 0,
        });
    });

    it('recovers from each bind error but still repeats the mistake', () => {
        expect(
            summarizePromptOutcome(
                promptOutcomeFixtures.recoveredFromRepeatedDuckdbBind,
                [],
            ),
        ).toMatchObject({
            toolCalls: 10,
            failedToolCalls: 5,
            recovered: true,
            gaveUp: false,
            repeatedErrorCode: 'duckdb_bind',
            repeatedErrorCount: 5,
        });
    });

    it('counts detours after a missing content read', () => {
        expect(
            summarizePromptOutcome(
                promptOutcomeFixtures.detoursAfterNotFound,
                [],
            ),
        ).toMatchObject({
            failedToolCalls: 1,
            errorCodes: ['not_found'],
            recovered: false,
            gaveUp: false,
            detourCalls: 6,
        });
    });

    it('counts repeated codes across the thread', () => {
        expect(
            summarizePromptOutcome(
                [
                    failed('runComposerQueries', 'duckdb_parse'),
                    ok('runComposerQueries', 0),
                ],
                ['duckdb_parse', 'duckdb_parse'],
            ),
        ).toMatchObject({
            recovered: true,
            repeatedErrorCode: 'duckdb_parse',
            repeatedErrorCount: 3,
            zeroRowQueries: 1,
        });
    });

    it('leaves recovery null when nothing failed', () => {
        expect(summarizePromptOutcome([ok('grepFields')], []).recovered).toBe(
            null,
        );
        expect(summarizePromptOutcome([], [])).toMatchObject({
            toolCalls: 0,
            gaveUp: false,
            recovered: null,
        });
    });

    it('rejects free text in the payload', () => {
        const base = {
            organizationId: '00000000-0000-4000-8000-000000000001',
            projectId: '00000000-0000-4000-8000-000000000002',
            aiAgentId: '00000000-0000-4000-8000-000000000003',
            threadId: '00000000-0000-4000-8000-000000000004',
            promptId: '00000000-0000-4000-8000-000000000005',
            model: 'claude-sonnet-4-5',
            serverVersion: '3.195.1',
            ...summarizePromptOutcome([], []),
        };
        expect(
            aiAgentPromptOutcomePropertiesSchema.safeParse(base).success,
        ).toBe(true);
        expect(
            aiAgentPromptOutcomePropertiesSchema.safeParse({
                ...base,
                answer: 'free text',
            }).success,
        ).toBe(false);
        expect(
            aiAgentPromptOutcomePropertiesSchema.safeParse({
                ...base,
                errorCodes: ['Binder Error: column x'],
            }).success,
        ).toBe(false);
    });
});
