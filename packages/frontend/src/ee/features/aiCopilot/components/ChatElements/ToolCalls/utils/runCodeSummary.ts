import { toolRunCodeArgsSchema } from '@lightdash/common';

const TOOL_CALL_PATTERN = /\btools\.([A-Za-z_$][\w$]*)\s*\(/g;
const LEADING_COMMENT_PATTERN = /^(?:\/\/+|\/\*+)\s*(.*?)\s*(?:\*\/)?$/;

/** The program's `js` when the args are a runCode call, else null. */
export const getRunCodeJs = (toolArgs: unknown): string | null => {
    const parsed = toolRunCodeArgsSchema.safeParse(toolArgs);
    return parsed.success ? parsed.data.js : null;
};

/**
 * One line standing in for a program: its leading comment when the model
 * wrote one, else the tools it calls, else its first line of code.
 */
export const summarizeRunCode = (js: string): string | null => {
    const firstLine = js
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (firstLine === undefined) return null;

    const comment = LEADING_COMMENT_PATTERN.exec(firstLine)?.[1];
    if (comment) return comment;

    const toolNames = [
        ...new Set(
            [...js.matchAll(TOOL_CALL_PATTERN)].flatMap((match) =>
                match[1] ? [match[1]] : [],
            ),
        ),
    ];
    if (toolNames.length > 0) return toolNames.join(', ');

    return firstLine;
};
