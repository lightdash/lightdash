/** Past this many lines a cell's code starts collapsed to a short preview. */
export const COLLAPSE_CODE_AFTER_LINES = 12;

export const isLongCode = (code: string): boolean =>
    code.trim().split('\n').length > COLLAPSE_CODE_AFTER_LINES;
