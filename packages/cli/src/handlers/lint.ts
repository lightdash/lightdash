import {
    chartAsCodeSchema,
    dashboardAsCodeSchema,
    modelAsCodeSchema,
} from '@lightdash/common';
import type { ErrorObject } from 'ajv';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ajv } from '../ajv';
import { createSarifReport } from './lint/ajvToSarif';
import { formatSarifForCli, getSarifSummary } from './lint/sarifFormatter';

type LintOptions = {
    path?: string;
    verbose?: boolean;
    format?: 'cli' | 'json';
};

type LocationMap = Map<string, { line: number; column: number }>;

type FileValidationResult = {
    filePath: string;
    valid: boolean;
    errors?: ErrorObject[];
    fileContent?: string;
    locationMap?: LocationMap;
    type?: 'chart' | 'dashboard' | 'model';
};

const validateChartSchema = ajv.compile(chartAsCodeSchema);
const validateDashboardSchema = ajv.compile(dashboardAsCodeSchema);
const validateModelSchema = ajv.compile(modelAsCodeSchema);

/**
 * Find all YAML and JSON files in a path (file or directory).
 * If a file path is provided, returns it if it's a .yml/.yaml/.json file.
 * If a directory path is provided, recursively searches for all such files.
 */
function findLightdashCodeFiles(inputPath: string): string[] {
    const files: string[] = [];

    // Check if the path is a file or directory
    const stats = fs.statSync(inputPath);

    if (stats.isFile()) {
        // Single file case - check if it's a valid extension
        const isYaml =
            inputPath.endsWith('.yml') || inputPath.endsWith('.yaml');
        const isJson = inputPath.endsWith('.json');

        if (isYaml || isJson) {
            files.push(inputPath);
        }
        return files;
    }

    // Directory case - walk recursively
    function walk(currentPath: string) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules, .git, etc.
                if (
                    !entry.name.startsWith('.') &&
                    entry.name !== 'node_modules' &&
                    entry.name !== 'target'
                ) {
                    walk(fullPath);
                }
            } else if (entry.isFile()) {
                const isYaml =
                    entry.name.endsWith('.yml') || entry.name.endsWith('.yaml');
                const isJson = entry.name.endsWith('.json');

                if (isYaml || isJson) {
                    files.push(fullPath);
                }
            }
        }
    }

    walk(inputPath);
    return files;
}

/**
 * Build a map of JSON paths to their line/column positions in the source YAML/JSON file.
 *
 * This creates a Map<string, {line, column}> by traversing the YAML Abstract Syntax Tree (AST).
 * For each YAML node encountered, we store its location keyed by its JSON path (e.g., '/metricQuery/filters').
 *
 * IMPORTANT: The map stores locations for ACTUAL YAML KEYS that exist in the file.
 * It does NOT contain entries for:
 * - Root path '/' (there's no root key in YAML)
 * - Missing required properties that don't exist in the file
 *
 * @param fileContent - The raw YAML or JSON file content
 * @param isJson - Whether the file is JSON (true) or YAML (false)
 * @returns Object containing parsed data and the location map
 */
function buildLocationMap(
    fileContent: string,
    isJson: boolean,
): { data: unknown; locationMap: LocationMap } {
    const locationMap: LocationMap = new Map();

    if (isJson) {
        // For JSON, parse normally (location map not populated - could be enhanced later)
        const data = JSON.parse(fileContent);
        return { data, locationMap };
    }

    // Parse YAML with the 'yaml' package to access the Abstract Syntax Tree (AST)
    const doc = YAML.parseDocument(fileContent);

    function traverse(node: YAML.Node | null, jsonPath: string) {
        if (!node) return;

        // Store location for this node
        if (node.range) {
            const [start] = node.range;
            const lines = fileContent.substring(0, start).split('\n');
            const line = lines.length;
            const column = lines[lines.length - 1].length + 1;
            locationMap.set(jsonPath, { line, column });
        }

        if (YAML.isMap(node)) {
            for (const pair of node.items) {
                if (YAML.isScalar(pair.key)) {
                    const key = String(pair.key.value);
                    const childPath = jsonPath
                        ? `${jsonPath}/${key}`
                        : `/${key}`;
                    traverse(pair.value as YAML.Node | null, childPath);
                }
            }
        } else if (YAML.isSeq(node)) {
            for (let i = 0; i < node.items.length; i += 1) {
                const childPath = `${jsonPath}/${i}`;
                traverse(node.items[i] as YAML.Node | null, childPath);
            }
        }
    }

    traverse(doc.contents, '');

    // Convert to plain JS object for validation
    const data = doc.toJS();
    return { data, locationMap };
}

/**
 * Validate a single YAML or JSON file
 */
function validateFile(filePath: string): FileValidationResult {
    try {
        // Read and parse file
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const isJson = filePath.endsWith('.json');
        const { data, locationMap } = buildLocationMap(fileContent, isJson);

        if (!data || typeof data !== 'object') {
            return {
                filePath,
                valid: false,
                // Skip non-object files as they're not lightdash code
            };
        }

        const dataObj = data as {
            version?: number;
            type?: string;
            metricQuery?: unknown;
            tiles?: unknown;
        };

        // Check if this is a model (has type: "model", "model/v1beta", or "model/v1")
        if (
            dataObj.type === 'model' ||
            dataObj.type === 'model/v1beta' ||
            dataObj.type === 'model/v1'
        ) {
            const valid = validateModelSchema(data);
            if (!valid && validateModelSchema.errors) {
                return {
                    filePath,
                    valid: false,
                    errors: validateModelSchema.errors,
                    fileContent,
                    locationMap,
                    type: 'model',
                };
            }
            return { filePath, valid: true, type: 'model' };
        }

        // Check if this is a chart (has version and metricQuery)
        if (dataObj.version === 1 && dataObj.metricQuery && !dataObj.tiles) {
            const valid = validateChartSchema(data);
            if (!valid && validateChartSchema.errors) {
                return {
                    filePath,
                    valid: false,
                    errors: validateChartSchema.errors,
                    fileContent,
                    locationMap,
                    type: 'chart',
                };
            }
            return { filePath, valid: true, type: 'chart' };
        }

        // Check if this is a dashboard (has version and tiles)
        if (dataObj.version === 1 && dataObj.tiles) {
            const valid = validateDashboardSchema(data);
            if (!valid && validateDashboardSchema.errors) {
                return {
                    filePath,
                    valid: false,
                    errors: validateDashboardSchema.errors,
                    fileContent,
                    locationMap,
                    type: 'dashboard',
                };
            }
            return { filePath, valid: true, type: 'dashboard' };
        }

        // Not a lightdash code file
        return {
            filePath,
            valid: true, // Don't report non-lightdash files as errors
        };
    } catch (error) {
        // Parsing error - skip this file
        return {
            filePath,
            valid: false,
        };
    }
}

export async function lintHandler(options: LintOptions): Promise<void> {
    const searchPath = path.resolve(options.path || process.cwd());
    const outputFormat = options.format || 'cli';

    // Check if path exists
    if (!fs.existsSync(searchPath)) {
        throw new Error(`Path does not exist: ${searchPath}`);
    }

    if (outputFormat === 'cli') {
        console.log(
            chalk.dim(`Searching for Lightdash Code files in: ${searchPath}\n`),
        );
    }

    // Find all YAML/JSON files
    const codeFiles = findLightdashCodeFiles(searchPath);

    if (codeFiles.length === 0) {
        if (outputFormat === 'cli') {
            console.log(
                chalk.yellow('No YAML/JSON files found in the specified path.'),
            );
        }
        return;
    }

    if (options.verbose && outputFormat === 'cli') {
        console.log(chalk.dim(`Found ${codeFiles.length} YAML/JSON files\n`));
    }

    // Validate each file
    const results: FileValidationResult[] = [];
    for (const file of codeFiles) {
        const result = validateFile(file);
        // Only track Lightdash Code files (models, charts, dashboards)
        if (result.type) {
            results.push(result);
        }
    }

    if (results.length === 0) {
        if (outputFormat === 'cli') {
            console.log(chalk.yellow('No Lightdash Code files found.'));
            console.log(
                chalk.dim(
                    'Models must have type: model (or model/v1, model/v1beta), charts must have version: 1 + metricQuery, dashboards must have version: 1 + tiles',
                ),
            );
        }
        return;
    }

    // Convert to SARIF format
    const invalidResults = results.filter((r) => !r.valid);
    const validCount = results.length - invalidResults.length;

    // Build SARIF report from invalid results
    const sarifResults = invalidResults
        .filter((r) => r.errors && r.fileContent && r.type)
        .map((r) => ({
            filePath: r.filePath,
            errors: r.errors!,
            fileContent: r.fileContent!,
            locationMap: r.locationMap,
            schemaType: r.type as 'chart' | 'dashboard',
        }));

    const sarifLog = createSarifReport(sarifResults);

    // Output based on format
    if (outputFormat === 'json') {
        console.log(JSON.stringify(sarifLog, null, 2));
    } else {
        // CLI format
        const summary = getSarifSummary(sarifLog);

        if (!summary.hasErrors) {
            console.log(
                chalk.green('\n✓ All Lightdash Code files are valid!\n'),
            );
            return;
        }

        // Show summary
        console.log(
            chalk.bold(`\nValidated ${results.length} Lightdash Code files:`),
        );
        console.log(chalk.green(`  ✓ ${validCount} valid`));
        console.log(chalk.red(`  ✗ ${summary.totalFiles} invalid`));

        // Show formatted errors (starts with newline, so we don't need extra spacing)
        console.log(formatSarifForCli(sarifLog, searchPath));
    }

    // Exit with error if there were validation failures
    if (invalidResults.length > 0) {
        process.exit(1);
    }
}
