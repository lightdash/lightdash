/**
 * A tiny, read-only, deterministic shell over {@link RepoFs}. It implements just
 * enough of bash to let an agent explore a repo compositionally — `ls`, `cat`,
 * `find`, `grep`, `head`, `wc -l`, chained with pipes — and nothing that can
 * mutate state or escape the repo. Unknown commands/flags fail loudly so the
 * model learns the boundary instead of silently getting wrong output.
 */
import { RepoEntryType, RepoFs } from './RepoFs';

const MAX_OUTPUT_CHARS = 60_000;
const MAX_GREP_FILES = 1_500;
const MAX_XARGS_ARGS = 2_000;
// Defense-in-depth cap on how much of a line the regex engine scans, bounding
// worst-case backtracking even if a dangerous pattern slips past the guard.
const MAX_MATCH_LINE = 1_000;

class ShellError extends Error {}

/** Split a command line into tokens, honouring single and double quotes. */
const tokenize = (input: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let hasToken = false;
    for (const char of input) {
        if (quote) {
            if (char === quote) quote = null;
            else current += char;
            hasToken = true;
        } else if (char === '"' || char === "'") {
            quote = char;
            hasToken = true;
        } else if (/\s/.test(char)) {
            if (hasToken) {
                tokens.push(current);
                current = '';
                hasToken = false;
            }
        } else {
            current += char;
            hasToken = true;
        }
    }
    if (quote) throw new ShellError('Unterminated quote in command');
    if (hasToken) tokens.push(current);
    return tokens;
};

/**
 * Split a command line into pipeline stages on `|`, but only when the `|` is
 * outside quotes — so a regex alternation like `grep -E 'a|b'` stays one stage
 * instead of being mistaken for a pipe.
 */
const splitPipeline = (input: string): string[] => {
    const stages: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    for (const char of input) {
        if (quote) {
            current += char;
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
            current += char;
        } else if (char === '|') {
            stages.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    stages.push(current);
    return stages.map((s) => s.trim()).filter((s) => s.length > 0);
};

/** Separate boolean/value flags from positional args for one command. */
const parseArgs = (
    tokens: string[],
    valueFlags: Set<string>,
): {
    flags: Set<string>;
    values: Map<string, string>;
    positionals: string[];
} => {
    const flags = new Set<string>();
    const values = new Map<string, string>();
    const positionals: string[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token.startsWith('-') && token.length > 1) {
            if (valueFlags.has(token)) {
                const next = tokens[i + 1];
                if (next === undefined) {
                    throw new ShellError(`Missing value for flag ${token}`);
                }
                values.set(token, next);
                i += 1;
            } else {
                // Support clustered short flags like `-rin`.
                for (const ch of token.slice(1)) flags.add(`-${ch}`);
            }
        } else {
            positionals.push(token);
        }
    }
    return { flags, values, positionals };
};

/**
 * Reject any clustered short flag whose letters aren't all supported, e.g.
 * `grep -v`. Unsupported flags must fail loudly — silently dropping them
 * (e.g. treating `grep -v` as a plain match) returns plausible-but-wrong output.
 * Negative-number tokens (`head -5`) are left for the command to interpret.
 */
const assertShortFlags = (
    tokens: string[],
    allowed: string,
    command: string,
): void => {
    for (const token of tokens) {
        if (
            token.startsWith('-') &&
            token.length > 1 &&
            !/^-\d+$/.test(token)
        ) {
            for (const ch of token.slice(1)) {
                if (!allowed.includes(ch)) {
                    throw new ShellError(
                        `${command}: unsupported flag -${ch} (supported: ${
                            allowed
                                .split('')
                                .map((c) => `-${c}`)
                                .join(', ') || 'none'
                        })`,
                    );
                }
            }
        }
    }
};

/**
 * Reject any word-style flag (e.g. `-maxdepth`, `-R`) not in `allowed`. Used by
 * commands whose flags are whole words rather than clustered letters.
 */
const assertWordFlags = (
    tokens: string[],
    allowed: Set<string>,
    command: string,
): void => {
    for (const token of tokens) {
        if (
            token.startsWith('-') &&
            token.length > 1 &&
            !/^-\d+$/.test(token) &&
            !allowed.has(token)
        ) {
            throw new ShellError(
                `${command}: unsupported flag ${token}${
                    allowed.size
                        ? ` (supported: ${[...allowed].join(', ')})`
                        : ' (no flags supported)'
                }`,
            );
        }
    }
};

/**
 * Split file content into lines for the line-oriented pipeline, dropping the
 * single trailing newline most files end with so `wc -l` matches the real tool
 * and `cat` does not emit a phantom empty final line.
 */
const toLines = (content: string): string[] =>
    (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');

const MAX_PATTERN_LENGTH = 200;
// A quantifier (`*`, `+`, `{n,}`) applied to a group — `(…)+`, `(…)*`, `(…){n}` —
// is the catastrophic-backtracking class: it covers nested quantifiers `(a+)+`,
// alternation `(a|aa)+`, and optionals `(aa?)+` alike. Node's regex engine
// backtracks synchronously on the event loop, so such a pattern from `grep -E`
// can hang the backend. A read-only code search never needs a quantified capture
// group, so reject the whole shape. (Also catch a char class quantified twice.)
// Heuristic, not a proof; a linear-time engine (re2) would be the complete fix.
const QUANTIFIED_GROUP = /\)[*+]|\)\{/;
const DOUBLE_CLASS_QUANTIFIER = /\[[^\]]*\][*+]\s*[*+{]/;

const buildMatcher = (
    pattern: string,
    { regex, ignoreCase }: { regex: boolean; ignoreCase: boolean },
): RegExp => {
    if (regex) {
        if (pattern.length > MAX_PATTERN_LENGTH) {
            throw new ShellError(
                `grep: pattern too long (max ${MAX_PATTERN_LENGTH} chars)`,
            );
        }
        if (
            QUANTIFIED_GROUP.test(pattern) ||
            DOUBLE_CLASS_QUANTIFIER.test(pattern)
        ) {
            throw new ShellError(
                'grep: pattern rejected — a quantifier applied to a group can cause catastrophic backtracking; simplify the expression',
            );
        }
    }
    const source = regex
        ? pattern
        : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
        return new RegExp(source, ignoreCase ? 'i' : '');
    } catch (e) {
        throw new ShellError(`Invalid pattern: ${pattern}`);
    }
};

const cmdLs = async (
    repoFs: RepoFs,
    positionals: string[],
): Promise<string[]> => {
    const path = positionals[0] ?? '';
    if (await repoFs.isDir(path)) {
        const entries = await repoFs.listDir(path);
        if (entries.length === 0) return [];
        return entries.map((e) => (e.type === 'dir' ? `${e.name}/` : e.name));
    }
    if (await repoFs.isFile(path)) return [path];
    throw new ShellError(`ls: ${path || '.'}: No such file or directory`);
};

const cmdCat = async (
    repoFs: RepoFs,
    positionals: string[],
): Promise<string[]> => {
    if (positionals.length === 0)
        throw new ShellError('cat: missing file operand');
    const lines: string[] = [];
    for (const path of positionals) {
        // eslint-disable-next-line no-await-in-loop
        const content = await repoFs.readFile(path);
        if (content === null) {
            throw new ShellError(`cat: ${path}: No such file or directory`);
        }
        if (positionals.length > 1) lines.push(`==> ${path} <==`);
        lines.push(...toLines(content));
    }
    return lines;
};

const cmdFind = async (repoFs: RepoFs, tokens: string[]): Promise<string[]> => {
    const { values, positionals } = parseArgs(
        tokens,
        new Set(['-name', '-type']),
    );
    const base = positionals[0] ?? '';
    const typeFlag = values.get('-type');
    if (typeFlag && typeFlag !== 'f' && typeFlag !== 'd') {
        throw new ShellError(
            `find: unsupported -type ${typeFlag} (use f or d)`,
        );
    }
    const typeByFlag: Record<string, RepoEntryType> = { f: 'file', d: 'dir' };
    const type = typeFlag ? typeByFlag[typeFlag] : undefined;
    return repoFs.walk(base, { type, nameGlob: values.get('-name') });
};

const cmdGrep = async (
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> => {
    const { flags, positionals } = parseArgs(tokens, new Set());
    const recursive = flags.has('-r') || flags.has('-R');
    const ignoreCase = flags.has('-i');
    const showLineNo = flags.has('-n');
    const regex = flags.has('-E');
    const listFilesOnly = flags.has('-l'); // print matching file names, not lines
    const [pattern, ...paths] = positionals;
    if (pattern === undefined) throw new ShellError('grep: missing pattern');
    const matcher = buildMatcher(pattern, { regex, ignoreCase });
    const test = (line: string): boolean =>
        matcher.test(
            line.length > MAX_MATCH_LINE ? line.slice(0, MAX_MATCH_LINE) : line,
        );

    // No paths: filter piped input.
    if (paths.length === 0 && (!recursive || stdin !== null)) {
        if (stdin === null) {
            throw new ShellError(
                'grep: no input (provide a path or pipe input)',
            );
        }
        if (listFilesOnly) {
            return stdin.some(test) ? ['(standard input)'] : [];
        }
        return stdin.filter(test);
    }

    // Gather candidate files from the given paths (dirs expand recursively).
    const fileSet = new Set<string>();
    for (const path of paths.length > 0 ? paths : ['']) {
        // eslint-disable-next-line no-await-in-loop
        if (await repoFs.isDir(path)) {
            // eslint-disable-next-line no-await-in-loop
            const found = await repoFs.walk(path, { type: 'file' });
            found.forEach((f) => fileSet.add(f));
            // eslint-disable-next-line no-await-in-loop
        } else if (await repoFs.isFile(path)) {
            fileSet.add(path);
        } else {
            throw new ShellError(`grep: ${path}: No such file or directory`);
        }
    }

    const files = [...fileSet].sort().slice(0, MAX_GREP_FILES);
    const output: string[] = [];
    const multiFile = files.length > 1;
    for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const content = await repoFs.readFile(file);
        if (content !== null) {
            const lines = toLines(content);
            if (listFilesOnly) {
                if (lines.some(test)) output.push(file);
            } else {
                lines.forEach((line, idx) => {
                    if (test(line)) {
                        const prefix = multiFile ? `${file}:` : '';
                        const lineNo = showLineNo ? `${idx + 1}:` : '';
                        output.push(`${prefix}${lineNo}${line}`);
                    }
                });
            }
        }
    }
    if (fileSet.size > MAX_GREP_FILES) {
        output.push(
            `… grep stopped after scanning ${MAX_GREP_FILES} files (narrow the path).`,
        );
    }
    return output;
};

const cmdHead = (tokens: string[], stdin: string[] | null): string[] => {
    if (stdin === null) {
        throw new ShellError('head: no input (pipe a command into head)');
    }
    // Support both `head -n N` and the `head -N` shorthand the model often uses.
    const shorthand = tokens.find((t) => /^-\d+$/.test(t));
    const { values } = parseArgs(
        tokens.filter((t) => !/^-\d+$/.test(t)),
        new Set(['-n']),
    );
    let n = 10;
    if (values.has('-n')) n = Number.parseInt(values.get('-n')!, 10);
    else if (shorthand) n = Number.parseInt(shorthand.slice(1), 10);
    if (!Number.isFinite(n) || n < 0) throw new ShellError('head: invalid -n');
    return stdin.slice(0, n);
};

const cmdWc = (tokens: string[], stdin: string[] | null): string[] => {
    const { flags } = parseArgs(tokens, new Set());
    if (!flags.has('-l')) throw new ShellError('wc: only -l is supported');
    if (stdin === null) throw new ShellError('wc: no input (pipe into wc -l)');
    return [String(stdin.length)];
};

async function runStage(
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> {
    const [command, ...rest] = tokens;
    switch (command) {
        case 'ls':
            assertWordFlags(rest, new Set(), 'ls');
            return cmdLs(repoFs, parseArgs(rest, new Set()).positionals);
        case 'cat':
            assertWordFlags(rest, new Set(), 'cat');
            return cmdCat(repoFs, parseArgs(rest, new Set()).positionals);
        case 'find':
            assertWordFlags(rest, new Set(['-name', '-type']), 'find');
            return cmdFind(repoFs, rest);
        case 'grep':
            assertShortFlags(rest, 'rRinEl', 'grep');
            return cmdGrep(repoFs, rest, stdin);
        case 'head':
            assertWordFlags(rest, new Set(['-n']), 'head');
            return cmdHead(rest, stdin);
        case 'wc':
            assertShortFlags(rest, 'l', 'wc');
            return cmdWc(rest, stdin);
        case 'xargs': {
            if (rest[0]?.startsWith('-')) {
                throw new ShellError(
                    `xargs: unsupported flag ${rest[0]} (usage: … | xargs <command>)`,
                );
            }
            // Append each stdin line as an argument to the wrapped command and
            // run it, e.g. `find … | xargs grep -l foo` → `grep -l foo <files>`.
            // Treats each line as a single arg (like `xargs -d "\n"`) so paths
            // with spaces survive. The wrapped command must be supported too.
            if (stdin === null) {
                throw new ShellError(
                    'xargs: no input (pipe a command into xargs)',
                );
            }
            const [wrapped, ...wrappedArgs] = rest;
            if (!wrapped) throw new ShellError('xargs: missing command');
            const items = stdin
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .slice(0, MAX_XARGS_ARGS);
            if (items.length === 0) return []; // nothing to run on (like xargs -r)
            return runStage(repoFs, [wrapped, ...wrappedArgs, ...items], null);
        }
        default:
            throw new ShellError(
                `Unsupported command: "${command}". Available: ls, cat, find, grep, head, wc -l, xargs.`,
            );
    }
}

const clamp = (text: string): string => {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… output truncated (${
        text.length - MAX_OUTPUT_CHARS
    } more characters). Narrow your command (e.g. pipe to \`head\` or grep a subpath).`;
};

/**
 * Execute one read-only shell command line (optionally piped) against the repo.
 * Returns combined stdout. Throws {@link ShellError} for unsupported syntax — the
 * caller surfaces the message to the agent as a normal tool result.
 */
export const runRepoShellCommand = async (
    repoFs: RepoFs,
    command: string,
): Promise<string> => {
    const stages = splitPipeline(command);
    if (stages.length === 0) throw new ShellError('Empty command');

    let stdin: string[] | null = null;
    let firstCommand: string | undefined;
    for (const stage of stages) {
        const tokens = tokenize(stage);
        if (tokens.length === 0) throw new ShellError('Empty command stage');
        if (firstCommand === undefined) [firstCommand] = tokens;
        // eslint-disable-next-line no-await-in-loop
        stdin = await runStage(repoFs, tokens, stdin);
    }

    const lines = stdin ?? [];
    // Surface a truncated tree so tree-walking commands don't read as exhaustive
    // when GitHub capped the file listing — otherwise find/grep/ls can return
    // silent false negatives on large repos.
    if (
        firstCommand &&
        ['find', 'grep', 'ls'].includes(firstCommand) &&
        (await repoFs.isTruncated())
    ) {
        lines.push(
            '… note: this repository is large and GitHub truncated its file listing, so find/grep/ls results may be incomplete — narrow to a subdirectory.',
        );
    }
    if (lines.length === 0) return '(no output)';
    return clamp(lines.join('\n'));
};

export { ShellError };
