import * as yaml from 'js-yaml';
import * as styles from '../styles';

// Longest-common-subsequence line diff; small documents only (as-code YAML),
// so the quadratic table is fine and avoids a runtime dependency.
const diffLines = (
    oldLines: string[],
    newLines: string[],
): { sign: '-' | '+' | ' '; line: string }[] => {
    const n = oldLines.length;
    const m = newLines.length;
    const lcs: number[][] = Array.from({ length: n + 1 }, () =>
        new Array<number>(m + 1).fill(0),
    );
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            lcs[i][j] =
                oldLines[i] === newLines[j]
                    ? lcs[i + 1][j + 1] + 1
                    : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const out: { sign: '-' | '+' | ' '; line: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (oldLines[i] === newLines[j]) {
            out.push({ sign: ' ', line: oldLines[i] });
            i += 1;
            j += 1;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            out.push({ sign: '-', line: oldLines[i] });
            i += 1;
        } else {
            out.push({ sign: '+', line: newLines[j] });
            j += 1;
        }
    }
    while (i < n) {
        out.push({ sign: '-', line: oldLines[i] });
        i += 1;
    }
    while (j < m) {
        out.push({ sign: '+', line: newLines[j] });
        j += 1;
    }
    return out;
};

const CONTEXT_LINES = 2;
const MAX_DIFF_LINES = 60;

/**
 * Unified-style diff of two as-code documents, changed hunks with a little
 * context. Empty string when the rendered documents are identical.
 */
export const renderContentDiff = (
    currentDoc: object,
    incomingDoc: object,
    labels: { current: string; incoming: string },
): string => {
    const dump = (doc: object) => {
        const { updatedAt, downloadedAt, needsUpdating, ...clean } =
            doc as Record<string, unknown>;
        return yaml.dump(clean, { quotingType: '"', sortKeys: true });
    };
    const entries = diffLines(
        dump(currentDoc).split('\n'),
        dump(incomingDoc).split('\n'),
    );
    if (!entries.some((entry) => entry.sign !== ' ')) return '';

    const keep = new Set<number>();
    entries.forEach((entry, index) => {
        if (entry.sign === ' ') return;
        for (
            let k = Math.max(0, index - CONTEXT_LINES);
            k <= Math.min(entries.length - 1, index + CONTEXT_LINES);
            k += 1
        ) {
            keep.add(k);
        }
    });

    const lines: string[] = [
        styles.error(`    --- ${labels.current}`),
        styles.success(`    +++ ${labels.incoming}`),
    ];
    let truncated = 0;
    let lastPrinted = -1;
    Array.from(keep)
        .sort((a, b) => a - b)
        .forEach((index) => {
            if (lines.length - 2 >= MAX_DIFF_LINES) {
                truncated += 1;
                return;
            }
            if (lastPrinted !== -1 && index > lastPrinted + 1) {
                lines.push(styles.secondary('    ⋮'));
            }
            lastPrinted = index;
            const { sign, line } = entries[index];
            const text = `    ${sign} ${line}`;
            if (sign === '-') lines.push(styles.error(text));
            else if (sign === '+') lines.push(styles.success(text));
            else lines.push(styles.secondary(text));
        });
    if (truncated > 0) {
        lines.push(styles.secondary(`    … ${truncated} more changed lines`));
    }
    return lines.join('\n');
};
