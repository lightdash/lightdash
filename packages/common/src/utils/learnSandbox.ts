import { parse as parseYaml } from 'yaml';

/**
 * Whether a Learn workspace file parses as YAML: null when it does, else the
 * parser's message. The server refuses to save a file that fails this, and
 * the workspace page applies the same rule before it asks, so the learner
 * hears about a mistake where they made it.
 */
export const validateLearnWorkspaceYaml = (content: string): string | null => {
    try {
        parseYaml(content);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : 'Invalid YAML';
    }
};

/**
 * One line for the learner: the parser's messages run to several lines with
 * a snippet, and name the line, which is all the page needs to point at.
 */
export const describeLearnWorkspaceYamlError = (message: string): string => {
    const line = /at line (\d+)/.exec(message)?.[1];
    return line
        ? `Fix the YAML error on line ${line} to continue`
        : 'Fix the YAML error to continue';
};
