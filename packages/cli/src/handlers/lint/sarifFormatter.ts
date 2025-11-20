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

    // Group results by file
    const resultsByFile = new Map<string, SarifResult[]>();
    for (const result of results) {
        const location = result.locations?.[0];
        const uri = location?.physicalLocation?.artifactLocation?.uri;
        if (uri) {
            if (!resultsByFile.has(uri)) {
                resultsByFile.set(uri, []);
            }
            resultsByFile.get(uri)!.push(result);
        }
    }

    // Count stats
    const totalFiles = resultsByFile.size;

    output.push(chalk.red('\nValidation Errors:\n'));

    // Format each file's errors
    for (const [fileUri, fileResults] of resultsByFile.entries()) {
        const relativePath = path.relative(searchPath, fileUri);
        output.push(chalk.red.bold(`\n✗ ${relativePath}`));

        for (const result of fileResults) {
            const message = result.message.text;
            const location = result.locations?.[0]?.physicalLocation;
            const line = location?.region?.startLine;
            const column = location?.region?.startColumn;

            output.push(
                chalk.red(`\n  ${message}${line ? ` (line ${line})` : ''}`),
            );

            // Add clickable file link for IDEs
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

    output.push(
        chalk.red(
            `\nValidation failed for ${totalFiles} file${
                totalFiles > 1 ? 's' : ''
            }`,
        ),
    );

    return output.join('\n');
}

/**
 * Get summary statistics from SARIF log
 */
export function getSarifSummary(sarifLog: SarifLog): {
    totalFiles: number;
    totalErrors: number;
    hasErrors: boolean;
} {
    if (!sarifLog.runs || sarifLog.runs.length === 0) {
        return { totalFiles: 0, totalErrors: 0, hasErrors: false };
    }

    const run = sarifLog.runs[0];
    const results = run.results || [];

    const uniqueFiles = new Set<string>();
    for (const result of results) {
        const location = result.locations?.[0];
        const uri = location?.physicalLocation?.artifactLocation?.uri;
        if (uri) {
            uniqueFiles.add(uri);
        }
    }

    return {
        totalFiles: uniqueFiles.size,
        totalErrors: results.length,
        hasErrors: results.length > 0,
    };
}
