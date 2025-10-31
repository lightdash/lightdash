import { TestContext } from 'vitest';
import { DbAiAgentToolCall } from '../../../../../database/entities/ai';
import { LlmJudgeResult } from '../../../utils/llmAsAJudge';
import { ToolJudgeResult } from '../../../utils/llmAsJudgeForTools';
import { setTaskMeta } from './taskMeta';

interface TestReportData {
    prompts?: string[];
    responses?: string[];
    toolCalls?: string[];
    llmJudgeResults?: LlmJudgeResult[];
    llmToolJudgeResults?: ToolJudgeResult[];
    agentInfo?: { provider: string; model: string };
}

/**
 * Wrapper that automatically tracks test metadata for report generation.
 * Use this to wrap test assertions and automatically collect metadata.
 *
 * @example
 * await withTestReport(task, {
 *   prompts: [promptQueryText],
 *   responses: [response],
 *   toolCalls: toolCalls.map(tc => tc.tool_name),
 *   llmJudgeResults: [{ ...factualityMeta, passed: isFactualityPassing }],
 * }, async () => {
 *   // Your test assertions here
 *   expect(isFactualityPassing).toBe(true);
 * });
 */
export async function withTestReport<T>(
    { task }: TestContext,
    reportData: TestReportData,
    testFn: () => T | Promise<T>,
): Promise<T> {
    try {
        return await testFn();
    } finally {
        // Always set metadata, even if test fails
        if (reportData.prompts) {
            setTaskMeta(task.meta, 'prompts', reportData.prompts);
        }
        if (reportData.responses) {
            setTaskMeta(task.meta, 'responses', reportData.responses);
        }
        if (reportData.toolCalls) {
            setTaskMeta(task.meta, 'toolCalls', reportData.toolCalls);
        }
        if (reportData.llmJudgeResults) {
            setTaskMeta(
                task.meta,
                'llmJudgeResults',
                reportData.llmJudgeResults,
            );
        }
        if (reportData.llmToolJudgeResults) {
            setTaskMeta(
                task.meta,
                'llmToolJudgeResults',
                reportData.llmToolJudgeResults,
            );
        }
        if (reportData.agentInfo) {
            setTaskMeta(
                task.meta,
                'agentProvider',
                reportData.agentInfo.provider,
            );
            setTaskMeta(task.meta, 'agentModel', reportData.agentInfo.model);
        }
    }
}

/**
 * Helper to build report data incrementally during a test.
 *
 * @example
 * const { meta } = await llmAsAJudge({ ... });
 * const report = createTestReport({
 *   prompt: promptQueryText,
 *   response,
 *   toolCalls,
 * }).addLlmJudgeResult(meta);
 *
 * await report.finalize(test, () => {
 *   expect(meta.passed).toBe(true);
 * });
 */
export class TestReportBuilder {
    private data: TestReportData = {};

    constructor(config?: {
        prompt?: string;
        prompts?: string[];
        response?: string;
        responses?: string[];
        toolCalls?: string[] | DbAiAgentToolCall[];
        agentInfo?: { provider: string; model: string };
    }) {
        if (config?.prompt) {
            this.data.prompts = [config.prompt];
        } else if (config?.prompts) {
            this.data.prompts = config.prompts;
        }

        if (config?.response) {
            this.data.responses = [config.response];
        } else if (config?.responses) {
            this.data.responses = config.responses;
        }

        if (config?.toolCalls) {
            const toolNames = Array.isArray(config.toolCalls)
                ? config.toolCalls.map((tc) =>
                      typeof tc === 'string' ? tc : tc.tool_name,
                  )
                : [];
            this.data.toolCalls = toolNames;
        }

        if (config?.agentInfo) {
            this.data.agentInfo = config.agentInfo;
        }
    }

    addLlmJudgeResult(result: LlmJudgeResult & { passed: boolean }): this {
        if (!this.data.llmJudgeResults) {
            this.data.llmJudgeResults = [];
        }
        this.data.llmJudgeResults.push(result);
        return this;
    }

    addLlmToolJudgeResult(result: ToolJudgeResult): this {
        if (!this.data.llmToolJudgeResults) {
            this.data.llmToolJudgeResults = [];
        }
        this.data.llmToolJudgeResults.push(result);
        return this;
    }

    async finalize<T>(
        test: TestContext,
        testFn: () => T | Promise<T>,
    ): Promise<T> {
        return withTestReport(test, this.data, testFn);
    }

    getData(): TestReportData {
        return { ...this.data };
    }
}

export function createTestReport(config?: {
    prompt?: string;
    prompts?: string[];
    response?: string;
    responses?: string[];
    toolCalls?: string[] | DbAiAgentToolCall[];
    agentInfo?: { provider: string; model: string };
}): TestReportBuilder {
    return new TestReportBuilder(config);
}
