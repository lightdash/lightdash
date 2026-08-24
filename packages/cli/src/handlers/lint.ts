import {
    assertUnreachable,
    chartAsCodeSchema,
    ContentAsCodeType,
    dashboardAsCodeSchema,
    getErrorMessage,
    modelAsCodeSchema,
} from '@lightdash/common';
import type { ErrorObject } from 'ajv';
import chalk from 'chalk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as YAML from 'yaml';
import { ajv } from '../ajv';
import { categorizeError, LightdashAnalytics } from '../analytics/analytics';
import {
    classifyContentFilePath,
    isSqlChartContent,
    type ContentFileClassification,
    type ContentFileType,
} from './contentAsCode/fileDiscovery';
import { getDownloadFolder } from './contentAsCodePaths';
import { createSarifReport } from './lint/ajvToSarif';
import { formatSarifForCli, getSarifSummary } from './lint/sarifFormatter';

type LintOptions = {
    path?: string;
    verbose?: boolean;
    format?: 'cli' | 'json';
};

type LocationMap = Map<string, { line: number; column: number }>;

type LightdashCodeType = ContentFileType | 'model';

type FileValidationResult = {
    filePath: string;
    valid: boolean;
    errors?: ErrorObject[];
    fileContent?: string;
    locationMap?: LocationMap;
    type?: LightdashCodeType;
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

    // Match upload parsing, then normalize the value as it will be serialized
    // into the upload request. Use `yaml` separately for source locations.
    const parsedData = yaml.load(fileContent);
    const serializedData = JSON.stringify(parsedData);
    const data =
        serializedData === undefined
            ? parsedData
            : (JSON.parse(serializedData) as unknown);
    const doc = YAML.parseDocument(fileContent, { merge: true });

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

    if (doc.errors.length === 0) {
        traverse(doc.contents, '');
    }

    return { data, locationMap };
}

function validateAsCodeSchema({
    data,
    fileContent,
    filePath,
    locationMap,
    type,
}: {
    data: unknown;
    fileContent: string;
    filePath: string;
    locationMap: LocationMap;
    type: LightdashCodeType;
}): FileValidationResult {
    let validate;
    switch (type) {
        case 'chart':
            validate = validateChartSchema;
            break;
        case 'dashboard':
            validate = validateDashboardSchema;
            break;
        case 'model':
            validate = validateModelSchema;
            break;
        default:
            return assertUnreachable(
                type,
                `Unknown Lightdash Code type: ${type}`,
            );
    }
    const valid = validate(data);

    if (!valid && validate.errors) {
        return {
            filePath,
            valid: false,
            errors: validate.errors,
            fileContent,
            locationMap,
            type,
        };
    }
    return { filePath, valid: true, type };
}

/**
 * Validate a single YAML or JSON file
 */
type LintData = {
    type?: string;
    contentType?: string;
};

function createErrorResult({
    error,
    fileContent,
    filePath,
    locationMap,
    type,
}: {
    error: ErrorObject;
    fileContent: string;
    filePath: string;
    locationMap?: LocationMap;
    type: LightdashCodeType;
}): FileValidationResult {
    return {
        filePath,
        valid: false,
        errors: [error],
        fileContent,
        locationMap,
        type,
    };
}

function getUploadType(
    classification: ContentFileClassification | undefined,
    data?: LintData,
): ContentFileType | undefined {
    if (classification?.kind === 'content') {
        return classification.contentType;
    }
    if (classification?.kind !== 'loose') return undefined;

    if (
        data?.contentType === ContentAsCodeType.CHART ||
        data?.contentType === ContentAsCodeType.SQL_CHART
    ) {
        return 'chart';
    }
    if (data?.contentType === ContentAsCodeType.DASHBOARD) {
        return 'dashboard';
    }
    return undefined;
}

function getModelCodeType(data?: LintData): 'model' | undefined {
    if (
        data?.type === 'model' ||
        data?.type === 'model/v1beta' ||
        data?.type === 'model/v1'
    ) {
        return 'model';
    }
    return undefined;
}

function getPartialYamlData(fileContent: string): LintData | undefined {
    try {
        const doc = YAML.parseDocument(fileContent, { merge: true });
        const data = doc.toJS() as unknown;
        return data && typeof data === 'object' && !Array.isArray(data)
            ? (data as LintData)
            : undefined;
    } catch {
        return undefined;
    }
}

function getParseErrorLocation(
    error: unknown,
): { line: number; column: number } | undefined {
    if (!error || typeof error !== 'object') return undefined;

    const linePos = Reflect.get(error, 'linePos');
    if (Array.isArray(linePos)) {
        const firstPosition = linePos[0] as { line?: unknown; col?: unknown };
        if (
            typeof firstPosition?.line === 'number' &&
            typeof firstPosition.col === 'number'
        ) {
            return { line: firstPosition.line, column: firstPosition.col };
        }
    }

    const mark = Reflect.get(error, 'mark') as
        | { line?: unknown; column?: unknown }
        | undefined;
    if (typeof mark?.line === 'number' && typeof mark.column === 'number') {
        return { line: mark.line + 1, column: mark.column + 1 };
    }
    return undefined;
}

function createUnsupportedExtensionResult(
    filePath: string,
    fileContent: string,
    type: ContentFileType,
): FileValidationResult {
    return createErrorResult({
        filePath,
        fileContent,
        type,
        error: {
            keyword: 'extension',
            instancePath: '',
            schemaPath: '',
            params: { allowedExtension: '.yml' },
            message: "Content files must use the '.yml' extension",
        },
    });
}

function validateFile(
    filePath: string,
    contentRoot: string,
): FileValidationResult {
    const classification = classifyContentFilePath(filePath, contentRoot);
    let fileContent: string | undefined;

    try {
        fileContent = fs.readFileSync(filePath, 'utf8');
        const isJson = filePath.endsWith('.json');
        const { data, locationMap } = buildLocationMap(fileContent, isJson);
        const dataObj =
            data && typeof data === 'object' && !Array.isArray(data)
                ? (data as LintData)
                : undefined;
        const uploadType = getUploadType(classification, dataObj);

        if (uploadType && classification?.supportedExtension === false) {
            return createUnsupportedExtensionResult(
                filePath,
                fileContent,
                uploadType,
            );
        }

        if (!dataObj) {
            return uploadType
                ? createErrorResult({
                      filePath,
                      fileContent,
                      locationMap,
                      type: uploadType,
                      error: {
                          keyword: 'type',
                          instancePath: '',
                          schemaPath: '#/type',
                          params: { type: 'object' },
                          message: 'must be object',
                      },
                  })
                : { filePath, valid: true };
        }

        if (uploadType) {
            if (uploadType === 'chart' && isSqlChartContent(dataObj)) {
                return { filePath, valid: true, type: 'chart' };
            }
            return validateAsCodeSchema({
                data,
                fileContent,
                filePath,
                locationMap,
                type: uploadType,
            });
        }

        const modelType = getModelCodeType(dataObj);
        if (modelType) {
            return validateAsCodeSchema({
                data,
                fileContent,
                filePath,
                locationMap,
                type: modelType,
            });
        }

        return { filePath, valid: true };
    } catch (error) {
        const partialData = fileContent
            ? getPartialYamlData(fileContent)
            : undefined;
        const uploadType = getUploadType(classification, partialData);
        const type = uploadType ?? getModelCodeType(partialData);
        if (!type) return { filePath, valid: true };
        if (uploadType && classification?.supportedExtension === false) {
            return createUnsupportedExtensionResult(
                filePath,
                fileContent ?? '',
                uploadType,
            );
        }

        const parseLocation = getParseErrorLocation(error);
        const locationMap = parseLocation
            ? new Map([['/', parseLocation]])
            : undefined;
        return createErrorResult({
            filePath,
            fileContent: fileContent ?? '',
            locationMap,
            type,
            error: {
                keyword: 'parse',
                instancePath: '',
                schemaPath: '',
                params: {},
                message: getErrorMessage(error),
            },
        });
    }
}

function getDefaultContentRoot(searchPath: string): string {
    const contentRootMarkers = [
        '.lightdash-metadata.json',
        'charts',
        'dashboards',
    ];
    return contentRootMarkers.some((marker) =>
        fs.existsSync(path.join(searchPath, marker)),
    )
        ? searchPath
        : getDownloadFolder();
}

export async function lintHandler(options: LintOptions): Promise<void> {
    const executionId = uuidv4();
    const startTime = Date.now();
    const searchPath = path.resolve(options.path || process.cwd());
    const outputFormat = options.format || 'cli';

    let shouldExitWithError = false;

    try {
        // Check if path exists
        if (!fs.existsSync(searchPath)) {
            throw new Error(`Path does not exist: ${searchPath}`);
        }
        let contentRoot = getDefaultContentRoot(searchPath);
        if (options.path) {
            contentRoot = fs.statSync(searchPath).isFile()
                ? path.dirname(searchPath)
                : searchPath;
        }

        if (outputFormat === 'cli') {
            console.log(
                chalk.dim(
                    `Searching for Lightdash Code files in: ${searchPath}\n`,
                ),
            );
        }

        // Find all YAML/JSON files
        const codeFiles = findLightdashCodeFiles(searchPath);
        const results: FileValidationResult[] = [];

        if (codeFiles.length === 0) {
            if (outputFormat === 'cli') {
                console.log(
                    chalk.yellow(
                        'No YAML/JSON files found in the specified path.',
                    ),
                );
            }
        } else {
            if (options.verbose && outputFormat === 'cli') {
                console.log(
                    chalk.dim(`Found ${codeFiles.length} YAML/JSON files\n`),
                );
            }

            // Validate each file
            for (const file of codeFiles) {
                const result = validateFile(file, contentRoot);
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
                            'Models must have type: model (or model/v1, model/v1beta). Charts and dashboards must be in their matching folder or declare contentType.',
                        ),
                    );
                }
            } else {
                // Build SARIF report from all results that produced schema errors.
                const sarifResults = results
                    .filter(
                        (r) =>
                            r.fileContent !== undefined &&
                            r.type &&
                            r.errors &&
                            r.errors.length > 0,
                    )
                    .map((r) => ({
                        filePath: r.filePath,
                        errors: r.errors ?? [],
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
                    const invalidCount = results.filter((r) => !r.valid).length;
                    const validCount = results.length - invalidCount;

                    if (!summary.hasErrors) {
                        console.log(
                            chalk.green(
                                '\n✓ All Lightdash Code files are valid!\n',
                            ),
                        );
                    } else {
                        // Show summary
                        console.log(
                            chalk.bold(
                                `\nValidated ${results.length} Lightdash Code files:`,
                            ),
                        );
                        console.log(chalk.green(`  ✓ ${validCount} valid`));
                        console.log(
                            chalk.red(
                                `  ✗ ${invalidCount} invalid (${summary.totalErrors} error${summary.totalErrors === 1 ? '' : 's'})`,
                            ),
                        );

                        // Show formatted errors
                        console.log(formatSarifForCli(sarifLog, searchPath));
                    }
                }

                if (results.some((r) => !r.valid)) {
                    shouldExitWithError = true;
                }
            }
        }

        const invalidCount = results.filter((r) => !r.valid).length;
        await LightdashAnalytics.track({
            event: 'lint.completed',
            properties: {
                executionId,
                filesScanned: codeFiles.length,
                lightdashFilesFound: results.length,
                validFiles: results.length - invalidCount,
                invalidFiles: invalidCount,
                chartFiles: results.filter((r) => r.type === 'chart').length,
                dashboardFiles: results.filter((r) => r.type === 'dashboard')
                    .length,
                modelFiles: results.filter((r) => r.type === 'model').length,
                outputFormat,
                durationMs: Date.now() - startTime,
            },
        });
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'lint.error',
            properties: {
                executionId,
                error: getErrorMessage(e),
                errorCategory: categorizeError(e),
            },
        });
        throw e;
    }

    if (shouldExitWithError) {
        process.exit(2);
    }
}
