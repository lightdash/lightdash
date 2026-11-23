import { SMALL_TEXT_LENGTH } from './constants';

export const COLUMN_WIDTH_SAMPLE_ROWS = 32;
export const MAX_COLUMN_WIDTH = 300;

const canvas =
    typeof OffscreenCanvas === 'undefined'
        ? undefined
        : new OffscreenCanvas(1, 1).getContext('2d');

function textWidth(text: string, bold: boolean, fontSize = 13): number {
    if (!canvas) return text.length * (bold ? 8 : 7);
    canvas.font = `${bold ? 600 : 400} ${fontSize}px Inter, sans-serif`;
    return canvas.measureText(text).width;
}

// Total horizontal padding of a standard Table header and body cell.
const tablePadding = { header: 22, body: 17 };

export function measureColumnWidth(
    label: string,
    values: readonly string[],
    headerControlsWidth = 0,
    padding = tablePadding,
    measureValue = (value: string) => textWidth(value, false),
): number {
    let width = textWidth(label, true) + padding.header + headerControlsWidth;
    for (const value of new Set(values)) {
        if (value.length > SMALL_TEXT_LENGTH) return MAX_COLUMN_WIDTH;
        width = Math.max(width, measureValue(value) + padding.body);
    }
    return Math.min(MAX_COLUMN_WIDTH, Math.ceil(width));
}

export function getRowNumberWidth(
    maxRowNumber: number,
    showTotal: boolean,
    padding = tablePadding,
) {
    const numbersWidth = measureColumnWidth(
        '#',
        [String(maxRowNumber)],
        0,
        padding,
    );
    return showTotal
        ? Math.max(
              numbersWidth,
              Math.ceil(textWidth('Total', true) + padding.body),
          )
        : numbersWidth;
}

function wordWidths(label: string, fontSize: number, leadingIcon = 0) {
    return label.trim()
        ? label
              .trim()
              .split(/\s+/)
              .map(
                  (word, index) =>
                      textWidth(word, false, fontSize) +
                      (index === 0 ? leadingIcon : 0),
              )
        : [];
}

function wrappedLines(words: number[], available: number, space: number) {
    let lines = words.length ? 1 : 0;
    let lineWidth = 0;
    for (const width of words) {
        if (lineWidth && lineWidth + space + width > available) {
            lines += 1;
            lineWidth = 0;
        }
        lineWidth += (lineWidth ? space : 0) + width;
    }
    return lines;
}

// Inter's tabular digits and hyphen occupy 0.65em and 0.76em. Canvas 2D uses proportional glyphs.
function tabularValueWidth(value: string) {
    let tabularWidth = 0;
    const proportional = value.replace(/[0-9-]/g, (glyph) => {
        tabularWidth += glyph === '-' ? 0.76 : 0.65;
        return '';
    });
    return textWidth(proportional, false) + 13 * tabularWidth;
}

export function measureExploreColumn(
    label: string,
    values: readonly string[],
    iconWidth: number,
) {
    const parts = label.split('\n');
    // ExplorerResults.module.css stacks the table label below the field and floats the menu.
    const nameWords = wordWidths(parts.pop() ?? '', 12, iconWidth);
    const tableWords = wordWidths(parts.join(' '), 11);
    const width = Math.max(
        Math.ceil(Math.max(88, ...nameWords, ...tableWords) + 17),
        measureColumnWidth(
            '',
            values,
            0,
            { header: 17, body: 17 },
            tabularValueWidth,
        ),
    );
    const available = width - 17;
    const fieldLines = wrappedLines(
        nameWords,
        available,
        textWidth(' ', false, 12),
    );
    const tableLines = wrappedLines(
        tableWords,
        available,
        textWidth(' ', false, 11),
    );
    return {
        width,
        headerHeight: Math.round(
            14 + (fieldLines * 12 + tableLines * 11) * (20 / 14),
        ),
    };
}
