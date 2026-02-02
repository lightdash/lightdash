/**
 * Simple CSV parser for filter value uploads.
 * Handles:
 * - Single-column CSV files
 * - Multi-column CSV files (user selects which column)
 * - Quoted values with embedded commas
 * - Various line endings (CRLF, LF, CR)
 * - Whitespace trimming
 * - Empty row filtering
 */

export interface ParsedCsv {
    headers: string[];
    rows: string[][];
    hasHeaders: boolean;
}

/**
 * Parse a single CSV line, handling quoted values with embedded commas.
 * Throws an error if a quote is unclosed.
 */
function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip the next quote
            } else if (char === '"') {
                // End of quoted value
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                // Start of quoted value
                inQuotes = true;
            } else if (char === ',') {
                // End of value
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }

    // Check for unclosed quotes
    if (inQuotes) {
        throw new Error('Unclosed quote in CSV line');
    }

    // Don't forget the last value
    values.push(current.trim());

    return values;
}

/**
 * Detect if the first row looks like headers (contains non-numeric, descriptive text).
 * This is a heuristic - we check if all values in the first row are non-empty strings
 * that don't look like typical data values (all caps, contains spaces, etc.)
 */
function detectHeaders(firstRow: string[], secondRow: string[] | undefined): boolean {
    if (!secondRow || firstRow.length === 0) {
        return false;
    }

    // If the first row has different "types" than the second row, likely headers
    const firstRowAllText = firstRow.every((val) => {
        const trimmed = val.trim();
        // Headers are typically: non-empty, not purely numeric, often contains letters
        return trimmed.length > 0 && isNaN(Number(trimmed));
    });

    const secondRowHasNumeric = secondRow.some((val) => {
        const trimmed = val.trim();
        return !isNaN(Number(trimmed)) && trimmed.length > 0;
    });

    // If first row is all text and second row has some numbers, likely headers
    if (firstRowAllText && secondRowHasNumeric) {
        return true;
    }

    // Check if first row values look like typical header names
    const headerPatterns = /^(id|name|email|date|value|type|status|code|key|uuid|identifier|number|count|amount|total|description|title|label)s?$/i;
    const hasHeaderLikeValues = firstRow.some((val) => headerPatterns.test(val.trim()));

    return hasHeaderLikeValues;
}

/**
 * Parse CSV content into a structured format.
 */
export function parseCsvContent(content: string): ParsedCsv {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split into lines and filter empty ones
    const lines = normalizedContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return { headers: [], rows: [], hasHeaders: false };
    }

    // Parse all lines
    const allRows = lines.map(parseCsvLine);

    // Detect if first row is headers
    const hasHeaders = detectHeaders(allRows[0], allRows[1]);

    if (hasHeaders) {
        return {
            headers: allRows[0],
            rows: allRows.slice(1),
            hasHeaders: true,
        };
    }

    // No headers - generate default column names
    const columnCount = Math.max(...allRows.map((row) => row.length));
    const headers = Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

    return {
        headers,
        rows: allRows,
        hasHeaders: false,
    };
}

/**
 * Extract values from a specific column, filtering out empty values.
 */
export function extractColumn(parsed: ParsedCsv, columnIndex: number): string[] {
    return parsed.rows
        .map((row) => row[columnIndex] ?? '')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

/**
 * Parse simple list content (one value per line, no CSV structure).
 * This handles plain text files with one value per line.
 */
export function parseSimpleList(content: string): string[] {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return normalizedContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/**
 * Detect if content is CSV (has commas) or simple list (just newlines).
 */
export function detectContentType(content: string): 'csv' | 'simple-list' {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
        return 'simple-list';
    }

    // Check if multiple lines have commas (suggesting CSV structure)
    const linesWithCommas = lines.filter((line) => line.includes(',')).length;

    // If more than half the lines have commas, treat as CSV
    return linesWithCommas > lines.length / 2 ? 'csv' : 'simple-list';
}
