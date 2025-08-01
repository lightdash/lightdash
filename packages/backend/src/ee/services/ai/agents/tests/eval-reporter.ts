import { Score } from 'autoevals';
import * as fs from 'fs';
import * as path from 'path';
import { File, Task, TaskMeta, Test } from 'vitest';
import type { Reporter } from 'vitest/node';
import {
    ContextRelevancyResponse,
    FactualityResponse,
    LlmJudgeResult,
} from './utils/llmAsAJudge';

interface EvalResult {
    testCase: string;
    result: 'pass' | 'fail' | 'skip';
    runAt: string;
    duration?: number;
    error?: string;
    errorStack?: string;
    suitePath: string[];
    file?: string;
    retryCount?: number;
    annotations?: Array<{
        message: string;
        type: string;
    }>;
    toolCalls?: TaskMeta['toolCalls'];
    llmJudgeResults?: TaskMeta['llmJudgeResults'];
    prompts?: TaskMeta['prompts'];
    responses?: TaskMeta['responses'];
}

export default class EvalHtmlReporter implements Reporter {
    private results: EvalResult[] = [];

    private outputDir: string;

    constructor() {
        this.outputDir = path.join(process.cwd(), 'eval-reports');
    }

    onInit() {
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    onFinished(files?: File[]): void {
        // Only process agent integration test files
        if (files) {
            const agentTestFiles = files.filter((file) =>
                file.filepath.includes('agent.integration.test'),
            );

            // Skip report generation if no agent tests were run
            if (agentTestFiles.length === 0) {
                return;
            }

            for (const file of agentTestFiles) {
                this.processFile(file);
            }
        }

        // Only generate report if we have results
        if (this.results.length > 0) {
            this.generateReport();
        }
    }

    private processFile(file: File) {
        // Recursively process all tasks in the file
        this.processTasks(file.tasks, [], file.filepath);
    }

    private processTasks(
        tasks: Task[],
        suitePath: string[] = [],
        file?: string,
    ) {
        for (const task of tasks) {
            if (task.type === 'test' && task.result) {
                const test = task as Test;
                // Get tool calls data from task metadata
                const taskMeta = test.meta;

                let testResult: 'pass' | 'fail' | 'skip' = 'fail';
                if (test.result?.state === 'pass') {
                    testResult = 'pass';
                } else if (test.result?.state === 'skip') {
                    testResult = 'skip';
                }

                const result: EvalResult = {
                    testCase: test.name,
                    result: testResult,
                    runAt: new Date().toISOString(),
                    duration: test.result?.duration,
                    error: test.result?.errors?.[0]?.message,
                    errorStack: test.result?.errors?.[0]?.stack,
                    suitePath,
                    file: file || test.file?.filepath,
                    retryCount: test.result?.retryCount,
                    annotations: test.annotations?.map((ann) => ({
                        message: ann.message,
                        type: ann.type,
                    })),
                    toolCalls: taskMeta.toolCalls,
                    llmJudgeResults: taskMeta.llmJudgeResults || [],
                    prompts: taskMeta.prompts || [],
                    responses: taskMeta.responses || [],
                };
                this.results.push(result);
            } else if (task.type === 'suite' && task.tasks) {
                // Recursively process nested suites
                this.processTasks(task.tasks, [...suitePath, task.name], file);
            }
        }
    }

    private generateReport() {
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const filename = `eval-report-${day}-${month}-${year}-at-H${hour}-M${minute}.html`;
        const filepath = path.join(this.outputDir, filename);

        const html = this.generateHtml();
        fs.writeFileSync(filepath, html);

        console.log(`\n📊 Eval report generated: ${filepath}`);
    }

    private generateHtml(): string {
        const passCount = this.results.filter(
            (r) => r.result === 'pass',
        ).length;
        const failCount = this.results.filter(
            (r) => r.result === 'fail',
        ).length;
        const skipCount = this.results.filter(
            (r) => r.result === 'skip',
        ).length;
        const totalCount = this.results.length;
        const passRate =
            totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : '0';

        const now = new Date();
        const formattedDate = `${now.toLocaleDateString(
            'en-GB',
        )} ${now.toLocaleTimeString('en-GB', { hour12: false })}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Agent Evaluation Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
            background: white;
            font-size: 12px;
        }
        .title {
            text-align: center;
            padding: 20px;
            border-bottom: 2px solid #dee2e6;
            background: #f8f9fa;
        }
        .title h1 {
            color: #2c3e50;
            margin: 0 0 8px 0;
            font-size: 24px;
        }
        .title .date {
            color: #6c757d;
            font-size: 14px;
        }
        .summary {
            display: flex;
            gap: 0;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
        }
        .summary-item {
            flex: 1;
            text-align: center;
            padding: 15px;
            border-right: 1px solid #dee2e6;
        }
        .summary-item:last-child {
            border-right: none;
        }
        .summary-item h3 {
            margin: 0 0 5px 0;
            color: #6c757d;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 600;
        }
        .summary-item .value {
            font-size: 24px;
            font-weight: bold;
            margin: 0;
        }
        .summary-item.pass .value { color: #28a745; }
        .summary-item.fail .value { color: #dc3545; }
        .summary-item.skip .value { color: #ffc107; }
        .summary-item.total .value { color: #007bff; }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th {
            background: #f8f9fa;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #dee2e6;
            font-size: 12px;
            border-right: 1px solid #dee2e6;
        }
        th:last-child {
            border-right: none;
        }
        td {
            padding: 12px 8px;
            border-bottom: 1px solid #dee2e6;
            vertical-align: top;
            border-right: 1px solid #dee2e6;
        }
        td:last-child {
            border-right: none;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .result-emoji {
            font-size: 18px;
            margin-right: 6px;
        }
        .pass { 
            color: #28a745;
            font-weight: 600;
        }
        .fail { 
            color: #dc3545;
            font-weight: 600;
        }
        .skip { 
            color: #ffc107;
            font-weight: 600;
        }
        .duration {
            color: #6c757d;
            font-size: 12px;
        }
        .expandable-row {
            background: #f8f9fa;
        }
        .expand-toggle {
            cursor: pointer;
            background: #007bff;
            border: none;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .expand-toggle:hover {
            background: #0056b3;
        }
        .llm-judge-details {
            padding: 16px;
            background: #f8f9fa;
        }
        .llm-judge-item {
            margin-bottom: 12px;
            padding: 12px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #28a745;
        }
        .llm-judge-item.fail {
            border-left-color: #dc3545;
        }
        .llm-judge-header {
            font-weight: 600;
            color: #495057;
            margin-bottom: 8px;
        }
        .llm-judge-score {
            font-weight: bold;
            color: #28a745;
            font-size: 11px;
        }
        .llm-judge-score.fail {
            color: #dc3545;
        }
    </style>
    <script>
        function toggleExpand(testId) {
            const expandRow = document.getElementById('expand-' + testId);
            const toggleBtn = document.getElementById('toggle-' + testId);
            
            if (expandRow.style.display === 'none' || expandRow.style.display === '') {
                expandRow.style.display = 'table-row';
                toggleBtn.textContent = '▼';
            } else {
                expandRow.style.display = 'none';
                toggleBtn.textContent = '▶';
            }
        }
    </script>
</head>
<body>
    <div class="title">
        <h1>AI Agent Evaluation Report</h1>
        <div class="date">${formattedDate}</div>
    </div>
    
    <div class="summary">
        <div class="summary-item pass">
            <h3>Passed</h3>
            <div class="value">${passCount}</div>
        </div>
        <div class="summary-item fail">
            <h3>Failed</h3>
            <div class="value">${failCount}</div>
        </div>
        <div class="summary-item skip">
            <h3>Skipped</h3>
            <div class="value">${skipCount}</div>
        </div>
        <div class="summary-item total">
            <h3>Pass Rate</h3>
            <div class="value">${passRate}%</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Result</th>
                <th>Test Case</th>
                <th>Suite</th>
                <th>Duration</th>
                <th>Tool Calls</th>
                <th>Scores</th>
            </tr>
        </thead>
        <tbody>
                ${this.results
                    .map(
                        (result, index) => `
                <tr>
                    <td class="${result.result}">
                        <span class="result-emoji">${EvalHtmlReporter.getResultEmoji(
                            result.result,
                        )}</span>
                        ${result.result.toUpperCase()}
                        ${
                            result.retryCount
                                ? ` <span style="font-size: 10px; color: #6c757d;">(${result.retryCount} retries)</span>`
                                : ''
                        }
                        ${
                            result.error
                                ? `<div style="margin-top: 4px; font-size: 10px; color: #dc3545;">${EvalHtmlReporter.escapeHtml(
                                      result.error.substring(0, 50),
                                  )}${
                                      result.error.length > 50 ? '...' : ''
                                  }</div>`
                                : ''
                        }
                    </td>
                    <td>
                        <strong>${EvalHtmlReporter.escapeHtml(
                            result.testCase,
                        )}</strong>
                        ${
                            result.annotations?.length
                                ? `<div style="margin-top: 4px;">${result.annotations
                                      .map(
                                          (ann) =>
                                              `<span style="font-size: 10px; background: #e9ecef; padding: 1px 4px; border-radius: 2px; margin-right: 4px;">${EvalHtmlReporter.escapeHtml(
                                                  ann.type,
                                              )}: ${EvalHtmlReporter.escapeHtml(
                                                  ann.message,
                                              )}</span>`,
                                      )
                                      .join('')}</div>`
                                : ''
                        }
                    </td>
                    <td style="font-size: 11px; color: #6c757d;">
                        ${
                            result.suitePath.length > 0
                                ? EvalHtmlReporter.escapeHtml(
                                      result.suitePath.join(' > '),
                                  )
                                : '-'
                        }
                    </td>
                    <td class="duration">${
                        result.duration
                            ? `${(result.duration / 1000).toFixed(2)}s`
                            : '-'
                    }</td>
                    <td style="font-size: 11px;">
                        ${
                            result.toolCalls && result.toolCalls.length > 0
                                ? `<div style="font-family: monospace; color: #007bff;">${result.toolCalls
                                      .map(
                                          (tc) =>
                                              `<span style="display: inline-block; background: #e7f3ff; padding: 1px 4px; margin: 1px; border-radius: 2px; font-size: 10px;">${EvalHtmlReporter.escapeHtml(
                                                  tc,
                                              )}</span>`,
                                      )
                                      .join('')}</div>`
                                : '<span style="color: #6c757d; font-size: 10px;">None</span>'
                        }
                    </td>
                    <td style="font-size: 11px;">
                        ${EvalHtmlReporter.generateLlmJudgeDetails(
                            result,
                            index,
                        )}
                    </td>
                </tr>
                ${EvalHtmlReporter.generateExpandableRow(result, index)}`,
                    )
                    .join('')}
        </tbody>
    </table>
</body>
</html>`;
    }

    private static escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    private static getResultEmoji(result: 'pass' | 'fail' | 'skip'): string {
        switch (result) {
            case 'pass':
                return '✅';
            case 'fail':
                return '❌';
            case 'skip':
                return '⏭️';
            default:
                return '❓';
        }
    }

    private static generateLlmJudgeDetails(
        result: EvalResult,
        testIndex: number,
    ): string {
        const hasLlmJudgeResults =
            result.llmJudgeResults && result.llmJudgeResults.length > 0;
        const hasPrompts = result.prompts && result.prompts.length > 0;
        const hasResponses = result.responses && result.responses.length > 0;

        if (!hasLlmJudgeResults && !hasPrompts && !hasResponses) {
            return '<span style="color: #6c757d;">No LLM judge evaluations</span>';
        }

        if (!hasLlmJudgeResults) {
            const expandButton = `<button id="toggle-${testIndex}" class="expand-toggle" onclick="toggleExpand(${testIndex})">▶</button>`;
            return `<div style="color: #6c757d; font-size: 10px;">None</div><div style="margin-top: 4px;">${expandButton}</div>`;
        }

        const summary = result.llmJudgeResults
            ?.map((judgeResult) => {
                const { scorerType, result: judgeData } = judgeResult;
                let scoreText = '';
                let scoreClass = '';

                switch (scorerType) {
                    case 'factuality':
                        const factResult = judgeData as FactualityResponse;
                        scoreText = `${factResult.answer}`;
                        scoreClass = judgeResult.passed ? 'pass' : 'fail';
                        break;
                    case 'jsonDiff':
                        const jsonResult = judgeData as Score;
                        scoreText = `${((jsonResult.score ?? 0) * 100).toFixed(
                            1,
                        )}%`;
                        scoreClass = judgeResult.passed ? 'pass' : 'fail';
                        break;
                    case 'contextRelevancy':
                        const contextResult =
                            judgeData as ContextRelevancyResponse;
                        scoreText = `${(contextResult.score * 100).toFixed(
                            1,
                        )}%`;
                        scoreClass = judgeResult.passed ? 'pass' : 'fail';
                        break;
                    default:
                        scoreText = 'N/A';
                        scoreClass = 'fail';
                        break;
                }

                return `<span class="llm-judge-score ${scoreClass}">${scorerType}: ${scoreText}</span>`;
            })
            .join('<br>');

        const expandButton = `<button id="toggle-${testIndex}" class="expand-toggle" onclick="toggleExpand(${testIndex})">▶</button>`;

        return `<div>${summary}</div><div style="margin-top: 4px;">${expandButton}</div>`;
    }

    private static generateExpandableRow(
        result: EvalResult,
        testIndex: number,
    ): string {
        if (
            (!result.llmJudgeResults || result.llmJudgeResults.length === 0) &&
            (!result.prompts || result.prompts.length === 0) &&
            (!result.responses || result.responses.length === 0)
        ) {
            return '';
        }

        // Generate prompts and responses section
        const promptsResponsesHtml =
            (result.prompts && result.prompts.length > 0) ||
            (result.responses && result.responses.length > 0)
                ? `
            <div class="llm-judge-item">
                <div class="llm-judge-header">PROMPTS & RESPONSES</div>
                ${
                    result.prompts && result.prompts.length > 0
                        ? `
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #007bff;">View Prompts (${
                            result.prompts.length
                        })</summary>
                        <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            ${result.prompts
                                .map(
                                    (prompt, idx) => `
                                <div style="margin-bottom: 8px;">
                                    <strong>Prompt ${idx + 1}:</strong>
                                    <div style="margin-top: 4px; font-family: monospace; background: white; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6;">
                                        ${EvalHtmlReporter.escapeHtml(
                                            prompt.substring(0, 300),
                                        )}${prompt.length > 300 ? '...' : ''}
                                    </div>
                                </div>
                            `,
                                )
                                .join('')}
                        </div>
                    </details>
                `
                        : ''
                }
                ${
                    result.responses && result.responses.length > 0
                        ? `
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #007bff;">View Responses (${
                            result.responses.length
                        })</summary>
                        <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            ${result.responses
                                .map(
                                    (response, idx) => `
                                <div style="margin-bottom: 8px;">
                                    <strong>Response ${idx + 1}:</strong>
                                    <div style="margin-top: 4px; font-family: monospace; background: white; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6;">
                                        ${EvalHtmlReporter.escapeHtml(
                                            response.substring(0, 300),
                                        )}${response.length > 300 ? '...' : ''}
                                    </div>
                                </div>
                            `,
                                )
                                .join('')}
                        </div>
                    </details>
                `
                        : ''
                }
            </div>
        `
                : '';

        const detailsHtml = result.llmJudgeResults
            ?.map((judgeResult) => {
                const {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    result: judgeData,
                    timestamp,
                } = judgeResult;

                let scoreDetails = '';
                switch (scorerType) {
                    case 'factuality':
                        const factResult = judgeData as FactualityResponse;
                        scoreDetails = `
                        <div><strong>Answer:</strong> ${EvalHtmlReporter.escapeHtml(
                            factResult.answer,
                        )}</div>
                        <div><strong>Rationale:</strong> ${EvalHtmlReporter.escapeHtml(
                            factResult.rationale,
                        )}</div>
                    `;
                        break;
                    case 'jsonDiff':
                        const jsonResult = judgeData as Score;
                        scoreDetails = `
                        <div><strong>Score:</strong> ${(
                            (jsonResult.score ?? 0) * 100
                        ).toFixed(1)}%</div>
                        
                    `;
                        break;
                    case 'contextRelevancy':
                        const contextResult =
                            judgeData as ContextRelevancyResponse;
                        scoreDetails = `
                        <div><strong>Score:</strong> ${(
                            contextResult.score * 100
                        ).toFixed(1)}%</div>
                        <div><strong>Reason:</strong> ${EvalHtmlReporter.escapeHtml(
                            contextResult.reason,
                        )}</div>
                    `;
                        break;
                    default:
                        scoreDetails = 'N/A';
                        break;
                }

                const isPass = judgeResult.passed;

                return `
                <div class="llm-judge-item ${isPass ? '' : 'fail'}">
                    <div class="llm-judge-header">${scorerType.toUpperCase()} Evaluation</div>
                    <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">${new Date(
                        timestamp,
                    ).toLocaleString()}</div>
                    ${scoreDetails}
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #007bff;">View Query & Response</summary>
                        <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            <div><strong>Query:</strong> ${EvalHtmlReporter.escapeHtml(
                                query,
                            )}</div>
                            <div style="margin-top: 4px;"><strong>Response:</strong> ${EvalHtmlReporter.escapeHtml(
                                response.substring(0, 200),
                            )}${response.length > 200 ? '...' : ''}</div>
                            ${
                                expectedAnswer
                                    ? `<div style="margin-top: 4px;"><strong>Expected:</strong> ${EvalHtmlReporter.escapeHtml(
                                          expectedAnswer.substring(0, 200),
                                      )}${
                                          expectedAnswer.length > 200
                                              ? '...'
                                              : ''
                                      }</div>`
                                    : ''
                            }
                            ${
                                'context' in judgeResult &&
                                judgeResult.context &&
                                judgeResult.context.length > 0
                                    ? `<div style="margin-top: 4px;"><strong>Context:</strong> ${judgeResult.context
                                          .slice(0, 3)
                                          .map((c: string) =>
                                              EvalHtmlReporter.escapeHtml(c),
                                          )
                                          .join(', ')}${
                                          judgeResult.context.length > 3
                                              ? '...'
                                              : ''
                                      }</div>`
                                    : ''
                            }
                        </div>
                    </details>
                </div>
            `;
            })
            .join('');

        return `
            <tr id="expand-${testIndex}" class="expandable-row" style="display: none;">
                <td colspan="6">
                    <div class="llm-judge-details">
                        <h4 style="margin-top: 0; color: #495057;">Test Execution Details</h4>
                        ${promptsResponsesHtml}
                        ${
                            detailsHtml && detailsHtml.length > 0
                                ? `<h4 style="color: #495057; margin-top: 16px;">LLM Judge Evaluation Details</h4>${detailsHtml}`
                                : ''
                        }
                    </div>
                </td>
            </tr>
        `;
    }
}

declare module 'vitest' {
    interface TaskMeta {
        toolCalls: string[];
        prompts: string[];
        responses: string[];
        llmJudgeResults: LlmJudgeResult[];
    }
}
