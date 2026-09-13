import type {
    LearnSandboxCommandRequest,
    LearnSandboxTool,
} from '@lightdash/common';

/**
 * Matches the "(command <uuid>)" suffix the backend appends to the 409
 * error it returns when a command is already running in the workspace.
 */
const ACTIVE_COMMAND_UUID_PATTERN = /\(command ([0-9a-f-]{36})\)/;

export const activeCommandFromError = (message: string): string | null => {
    const match = ACTIVE_COMMAND_UUID_PATTERN.exec(message);
    return match ? match[1] : null;
};

const ALLOWED_TOOLS: LearnSandboxTool[] = ['lightdash', 'dbt'];

const TOKEN_PATTERN = /"([^"]*)"|(\S+)/g;

const tokenize = (input: string): string[] => {
    const tokens: string[] = [];
    let match: RegExpExecArray | null = TOKEN_PATTERN.exec(input);
    while (match !== null) {
        tokens.push(match[1] ?? match[2]);
        match = TOKEN_PATTERN.exec(input);
    }
    return tokens;
};

/**
 * A whitespace tokenizer with double-quote grouping, restricted to the
 * `lightdash`/`dbt` allowlist the sandbox terminal accepts.
 */
export const parseCommand = (
    input: string,
): LearnSandboxCommandRequest | { error: string } => {
    const tokens = tokenize(input.trim());
    if (tokens.length === 0) {
        return { error: 'Type a subcommand, for example: dbt parse' };
    }
    const [tool, subcommand, ...args] = tokens;
    if (!ALLOWED_TOOLS.includes(tool as LearnSandboxTool)) {
        return { error: 'Commands start with lightdash or dbt' };
    }
    if (!subcommand) {
        return { error: 'Type a subcommand, for example: dbt parse' };
    }
    return { tool: tool as LearnSandboxTool, subcommand, args };
};
