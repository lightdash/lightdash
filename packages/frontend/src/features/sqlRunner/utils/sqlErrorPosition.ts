import { type MonacoHighlightChar } from '../components/SqlEditor';

// Warehouses report a position against the query they actually ran, which
// can be the user's SQL flattened onto one line. A line-1 position past the
// end of the first line is such an offset, so walk it back onto the lines.
export const resolveSqlErrorPosition = (
    sql: string,
    reported: { lineNumber: number; charNumber: number },
): MonacoHighlightChar | undefined => {
    const { lineNumber, charNumber } = reported;
    if (!Number.isFinite(lineNumber) || !Number.isFinite(charNumber)) {
        return undefined;
    }
    const lines = sql.split('\n');
    if (lineNumber !== 1 || charNumber <= lines[0].length + 1) {
        return { line: lineNumber, char: charNumber };
    }
    let remaining = charNumber;
    for (let index = 0; index < lines.length; index += 1) {
        const lineLength = lines[index].length + 1;
        if (remaining <= lineLength) {
            return { line: index + 1, char: remaining };
        }
        remaining -= lineLength;
    }
    return { line: lineNumber, char: charNumber };
};
