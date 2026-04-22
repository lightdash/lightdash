import type { TestResult } from '../types';
import type { WarehouseType } from '../config';
import type { TestCase } from '../types';

const SEPARATOR = '════════════════════════════════════════════════';

function getTestCaseById(
    cases: TestCase[],
    id: string,
): TestCase | undefined {
    return cases.find((c) => c.id === id);
}

export function formatResults(
    results: TestResult[],
    cases: TestCase[],
    tier: string,
    warehouses: WarehouseType[],
): string {
    const lines: string[] = [];

    lines.push(SEPARATOR);
    lines.push(` FORMULA TESTS — ${tier} — ${warehouses.join(' + ')}`);
    lines.push(SEPARATOR);
    lines.push('');

    for (const wh of warehouses) {
        const whResults = results.filter((r) => r.warehouse === wh);
        const passed = whResults.filter((r) => r.status === 'PASS').length;
        const total = whResults.length;

        lines.push(`[${wh}] ${passed}/${total} passed`);
        lines.push('');

        for (const result of whResults) {
            if (result.status === 'PASS') {
                lines.push(`  ✓ ${result.testId}`);
            } else {
                const testCase = getTestCaseById(cases, result.testId);
                lines.push(`  ✗ ${result.testId}`);

                if (testCase) {
                    lines.push(`    Formula:     ${testCase.formula}`);
                    lines.push(`    Description: ${testCase.description}`);
                }

                lines.push(`    Error:       ${result.status}`);

                if (result.message) {
                    lines.push(`    Message:     ${result.message}`);
                }
                if (result.dbMessage) {
                    lines.push(`    DB message:  ${result.dbMessage}`);
                }
                if (result.hint) {
                    lines.push(`    Hint:        ${result.hint}`);
                }
                if (result.expectedSummary) {
                    lines.push(`    Expected:    ${result.expectedSummary}`);
                }
                if (result.actualSummary) {
                    lines.push(`    Actual:      ${result.actualSummary}`);
                }

                lines.push('');
            }
        }

        lines.push('');
    }

    const totalPassed = results.filter((r) => r.status === 'PASS').length;
    const totalTests = results.length;
    const pct = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0.0';

    lines.push(SEPARATOR);
    lines.push(` SUMMARY: ${totalPassed}/${totalTests} passed (${pct}%)`);
    lines.push(SEPARATOR);

    return lines.join('\n');
}
