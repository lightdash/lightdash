import type { ErrorObject } from 'ajv';

type LocationMap = Map<string, { line: number; column: number }>;

type FileValidationResult = {
    filePath: string;
    errors: ErrorObject[];
    fileContent: string;
    locationMap?: LocationMap;
    schemaType: 'chart' | 'dashboard' | 'model';
};

// SARIF 2.1.0 types
export type SarifLog = {
    version: '2.1.0';
    $schema: string;
    runs: SarifRun[];
};

type SarifRun = {
    tool: {
        driver: {
            name: string;
            version: string;
            informationUri?: string;
            rules?: SarifRule[];
        };
    };
    results: SarifResult[];
};

type SarifRule = {
    id: string;
    shortDescription: {
        text: string;
    };
    fullDescription?: {
        text: string;
    };
    help?: {
        text: string;
    };
};

export type SarifResult = {
    ruleId: string;
    level: 'error' | 'warning' | 'note';
    message: {
        text: string;
    };
    locations: SarifLocation[];
    properties?: Record<string, unknown>;
};

type SarifLocation = {
    physicalLocation: {
        artifactLocation: {
            uri: string;
        };
        region: {
            startLine: number;
            startColumn: number;
        };
    };
};

/**
 * Find the line and column number in YAML content for a given data path using regex-based search.
 *
 * This is a FALLBACK strategy used when the locationMap doesn't have an entry for the error path.
 * Primary use case: root-level missing required properties (dataPath='/' which isn't in locationMap).
 *
 * The function uses regex patterns to search through the YAML content and locate:
 * - Array items by counting '-' markers
 * - Nested properties within array items
 * - Simple top-level keys
 *
 * Returns line 1, column 1 if no match is found (used for root-level errors).
 */
function findLocationForPath(
    yamlContent: string,
    dataPath: string,
): { line: number; column: number } | null {
    const lines = yamlContent.split('\n');

    // Remove leading slash and split path
    const pathParts = dataPath
        .replace(/^\//, '')
        .split('/')
        .filter((p) => p !== '');

    if (pathParts.length === 0) {
        // Error at root level
        return { line: 1, column: 1 };
    }

    // Check if we have an array index in the path (e.g., /dimensions/1/type)
    let arrayParentKey: string | null = null;
    let arrayIndex: number | null = null;
    let propertyInArray: string | null = null;

    // Look for pattern: parent/index/property
    if (pathParts.length >= 3) {
        const secondToLast = pathParts[pathParts.length - 2];
        if (/^\d+$/.test(secondToLast)) {
            // We have an array index
            arrayParentKey = pathParts[pathParts.length - 3];
            arrayIndex = parseInt(secondToLast, 10);
            propertyInArray = pathParts[pathParts.length - 1];
        }
    } else if (pathParts.length === 2) {
        const [firstPart, lastPart] = pathParts;
        if (/^\d+$/.test(lastPart)) {
            // Path is like /dimensions/1
            arrayParentKey = firstPart;
            arrayIndex = parseInt(lastPart, 10);
        }
    }

    // For array items with nested property errors (e.g., /dimensions/1/type)
    if (arrayParentKey && arrayIndex !== null && propertyInArray) {
        const parentPattern = new RegExp(`^\\s*${arrayParentKey}\\s*:`);
        let foundParent = false;
        let arrayItemCount = 0;
        let arrayItemStartLine = -1;

        for (let i = 0; i < lines.length; i += 1) {
            if (!foundParent && parentPattern.test(lines[i])) {
                foundParent = true;
            } else if (foundParent && /^\s*-\s/.test(lines[i])) {
                if (arrayItemCount === arrayIndex) {
                    arrayItemStartLine = i;
                    break;
                }
                arrayItemCount += 1;
            }
        }

        // Now find the nested property within this array item
        if (arrayItemStartLine >= 0) {
            // Check if property is on the same line as the array marker (e.g., "- id: value")
            const sameLinePattern = new RegExp(
                `^\\s*-\\s+${propertyInArray}\\s*:`,
            );
            if (sameLinePattern.test(lines[arrayItemStartLine])) {
                const match = lines[arrayItemStartLine].match(/^(\s*-\s+)/);
                const column = match ? match[1].length + 1 : 1;
                return { line: arrayItemStartLine + 1, column };
            }

            // Otherwise, look for the property on subsequent lines
            const propPattern = new RegExp(`^\\s*${propertyInArray}\\s*:`);
            for (
                let i = arrayItemStartLine + 1;
                i < Math.min(lines.length, arrayItemStartLine + 20);
                i += 1
            ) {
                if (propPattern.test(lines[i])) {
                    const match = lines[i].match(/^(\s*)/);
                    const column = match ? match[1].length + 1 : 1;
                    return { line: i + 1, column };
                }

                if (/^\s*-\s/.test(lines[i])) {
                    break;
                }
            }
        }
    }

    // Simple search for the last key in the path
    const lastPart = pathParts[pathParts.length - 1];
    if (!/^\d+$/.test(lastPart)) {
        const keyPattern = new RegExp(`^\\s*${lastPart}\\s*:`);
        for (let i = 0; i < lines.length; i += 1) {
            if (keyPattern.test(lines[i])) {
                const match = lines[i].match(/^(\s*)/);
                const column = match ? match[1].length + 1 : 1;
                return { line: i + 1, column };
            }
        }
    }

    return { line: 1, column: 1 };
}

/**
 * Get a friendly error message for an AJV error
 */
function getFriendlyMessage(error: ErrorObject): string {
    if (error.keyword === 'required' && error.params.missingProperty) {
        return `Missing required property '${error.params.missingProperty}'`;
    }
    if (
        error.keyword === 'additionalProperties' &&
        error.params.additionalProperty
    ) {
        return `Property '${error.params.additionalProperty}' is not allowed`;
    }
    if (error.keyword === 'type') {
        return `Expected type '${error.params.type}'`;
    }
    if (error.keyword === 'enum' && error.params.allowedValues) {
        return `Value must be one of: ${error.params.allowedValues.join(', ')}`;
    }
    if (error.keyword === 'const') {
        return `Value must be '${error.params.allowedValue}'`;
    }
    return error.message || 'Validation error';
}

/**
 * Convert validation results to SARIF format
 */
export function createSarifReport(results: FileValidationResult[]): SarifLog {
    const sarifResults: SarifResult[] = [];
    const rules = new Map<string, SarifRule>();

    for (const result of results) {
        for (const error of result.errors) {
            // For additionalProperties errors, append the property name to the path
            // Handle root-level errors carefully to avoid double slashes (//propertyName)
            let dataPath = error.instancePath || '/';
            if (
                error.keyword === 'additionalProperties' &&
                error.params.additionalProperty
            ) {
                dataPath =
                    dataPath === '/'
                        ? `/${error.params.additionalProperty}`
                        : `${dataPath}/${error.params.additionalProperty}`;
            }

            // Determine error location using a two-strategy approach:
            // 1. PRIMARY: Use locationMap (built from YAML AST during parsing)
            //    - Fast O(1) lookup for ~95% of cases
            //    - Works for: additional properties, type errors, enum errors, nested errors, array items
            //    - Works for: nested missing required fields (e.g., missing 'exploreName' in 'metricQuery')
            //
            // 2. FALLBACK: Use regex-based search when locationMap lookup fails
            //    - Needed for: root-level missing required properties (e.g., missing 'name', 'version')
            //      These have dataPath='/' which doesn't exist in locationMap since it stores actual YAML keys
            //    - Also provides defensive error handling if AST traversal misses any edge cases
            let location: { line: number; column: number } | null = null;
            if (result.locationMap) {
                location = result.locationMap.get(dataPath) || null;
            }
            if (!location) {
                // Fallback to regex search - primarily for root-level missing required properties
                location = findLocationForPath(result.fileContent, dataPath);
            }

            const message = getFriendlyMessage(error);
            const ruleId = `${result.schemaType}/${error.keyword}`;

            // Add rule if we haven't seen it before
            if (!rules.has(ruleId)) {
                rules.set(ruleId, {
                    id: ruleId,
                    shortDescription: {
                        text: `${error.keyword} validation error`,
                    },
                });
            }

            const sarifResult: SarifResult = {
                ruleId,
                level: 'error',
                message: {
                    text: message,
                },
                locations: [
                    {
                        physicalLocation: {
                            artifactLocation: {
                                uri: result.filePath,
                            },
                            region: {
                                startLine: location?.line || 1,
                                startColumn: location?.column || 1,
                            },
                        },
                    },
                ],
            };

            // Add additional context
            if (error.params) {
                const properties: Record<string, unknown> = {};
                Object.entries(error.params).forEach(([key, value]) => {
                    properties[key] = value;
                });
                sarifResult.properties = { errorParams: properties };
            }

            sarifResults.push(sarifResult);
        }
    }

    return {
        version: '2.1.0',
        $schema:
            'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'lightdash-lint',
                        version: '1.0.0',
                        informationUri:
                            'https://github.com/lightdash/lightdash',
                        rules: Array.from(rules.values()),
                    },
                },
                results: sarifResults,
            },
        ],
    };
}
