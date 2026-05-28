import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { SarifLog, SarifResult } from './ajvToSarif';

/**
 * Get a snippet of the file around the error location
 */
function getCodeSnippet(
    filePath: string,
    line: number,
    contextLines: number = 2,
): string {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        const startLine = Math.max(0, line - 1 - contextLines);
        const endLine = Math.min(lines.length, line + contextLines);

        return lines
            .slice(startLine, endLine)
            .map((lineText, idx) => {
                const lineNum = startLine + idx + 1;
                const prefix = lineNum === line ? '→ ' : '  ';
                return `${prefix}${lineNum
                    .toString()
                    .padStart(3, ' ')} | ${lineText}`;
            })
            .join('\n');
    } catch {
        return '';
    }
}

/**
 * Format SARIF results for CLI output
 */
export function formatSarifForCli(
    sarifLog: SarifLog,
    searchPath: string,
): string {
    const output: string[] = [];

    if (!sarifLog.runs || sarifLog.runs.length === 0) {
        return chalk.green('\n✓ All Lightdash Code files are valid!\n');
    }

    const run = sarifLog.runs[0];
    const results = run.results || [];

    if (results.length === 0) {
        return chalk.green('\n✓ All Lightdash Code files are valid!\n');
    }

    const errorResults = results.filter((r) => r.level === 'error');
    const warningResults = results.filter((r) => r.level === 'warning');

    const renderSection = (
        sectionResults: SarifResult[],
        sectionLabel: string,
        color: (text: string) => string,
        boldColor: (text: string) => string,
        marker: string,
        closingLabel: (count: number) => string,
    ) => {
        if (sectionResults.length === 0) return;

        // Group results by file
        const byFile = new Map<string, SarifResult[]>();
        for (const result of sectionResults) {
            const uri =
                result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
            if (uri) {
                if (!byFile.has(uri)) byFile.set(uri, []);
                byFile.get(uri)!.push(result);
            }
        }

        output.push(color(`\n${sectionLabel}\n`));

        for (const [fileUri, fileResults] of byFile.entries()) {
            const relativePath = path.relative(searchPath, fileUri);
            output.push(boldColor(`\n${marker} ${relativePath}`));

            for (const result of fileResults) {
                const message = result.message.text;
                const location = result.locations?.[0]?.physicalLocation;
                const line = location?.region?.startLine;
                const column = location?.region?.startColumn;

                output.push(
                    color(`\n  ${message}${line ? ` (line ${line})` : ''}`),
                );

                if (line) {
                    // Encode the URI properly for file:// protocol to handle special characters (#, ?, &, spaces, etc.)
                    const encodedPath = encodeURI(fileUri);
                    const fileLink = `file://${encodedPath}:${line}${
                        column ? `:${column}` : ''
                    }`;
                    output.push(chalk.dim(`  ${fileLink}`));
                }

                if (line && fs.existsSync(fileUri)) {
                    const snippet = getCodeSnippet(fileUri, line);
                    if (snippet) {
                        output.push(chalk.dim(`\n${snippet}\n`));
                    }
                }
            }
        }

        output.push(color(`\n${closingLabel(byFile.size)}`));
    };

    renderSection(
        errorResults,
        'Validation Errors:',
        chalk.red,
        chalk.red.bold,
        '✗',
        (count) => `Validation failed for ${count} file${count > 1 ? 's' : ''}`,
    );

    renderSection(
        warningResults,
        'Validation Warnings:',
        chalk.yellow,
        chalk.yellow.bold,
        '⚠',
        (count) => `${count} file${count > 1 ? 's have' : ' has'} warnings`,
    );

    return output.join('\n');
}

/**
 * Get summary statistics from SARIF log
 */
export function getSarifSummary(sarifLog: SarifLog): {
    totalFiles: number;
    totalErrors: number;
    totalWarnings: number;
    hasErrors: boolean;
    hasWarnings: boolean;
} {
    if (!sarifLog.runs || sarifLog.runs.length === 0) {
        return {
            totalFiles: 0,
            totalErrors: 0,
            totalWarnings: 0,
            hasErrors: false,
            hasWarnings: false,
        };
    }

    const run = sarifLog.runs[0];
    const results = run.results || [];

    const uniqueFiles = new Set<string>();
    let totalErrors = 0;
    let totalWarnings = 0;
    for (const result of results) {
        const location = result.locations?.[0];
        const uri = location?.physicalLocation?.artifactLocation?.uri;
        if (uri) {
            uniqueFiles.add(uri);
        }
        if (result.level === 'warning') {
            totalWarnings += 1;
        } else {
            totalErrors += 1;
        }
    }

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        hasErrors: totalErrors > 0,
        hasWarnings: totalWarnings > 0,
    };
}
