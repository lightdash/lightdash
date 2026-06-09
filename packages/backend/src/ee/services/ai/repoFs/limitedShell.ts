/**
 * A tiny, read-only, deterministic shell over {@link RepoFs}. It implements just
 * enough of bash to let an agent explore a repo compositionally — `ls`, `cat`,
 * `find` (incl. `-maxdepth`), `grep`, `head`, `wc`, `sort`, `xargs` — composed
 * with pipes and `&&`, and nothing that can mutate state or escape the repo. Unknown
 * commands/flags fail loudly (a {@link ShellError} the caller hands back to the
 * model) so the model learns the boundary instead of silently getting wrong
 * output.
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

// Redirection operators (`2>`, `>`, `>>`, `2>&1`, `&>`, …). The agent often
// appends `2>/dev/null` to a grep out of bash habit; we have no streams to
// redirect, so silently drop these tokens instead of treating them as paths and
// failing the whole command.
const REDIRECT_TOKEN = /^(?:\d*>>?|[&\d]?>&\d?|&>)/;
const REDIRECT_OPERATOR_ONLY = /^(?:\d*>>?|&>)$/;

/** Drop shell redirections from a tokenised stage so they can't break parsing. */
const stripRedirections = (tokens: string[]): string[] => {
    const out: string[] = [];
    let skipNext = false;
    for (const token of tokens) {
        if (skipNext) {
            // Consumes the target filename after a bare operator (`>`, `2>`).
            skipNext = false;
        } else if (REDIRECT_TOKEN.test(token)) {
            // A bare operator is followed by its target; a glued form
            // (`2>/dev/null`, `2>&1`) is self-contained.
            skipNext = REDIRECT_OPERATOR_ONLY.test(token);
        } else {
            out.push(token);
        }
    }
    return out;
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
    const escapeLiteral = (s: string): string =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Without -E the pattern is a literal substring, EXCEPT we honour GNU grep's
    // BRE alternation `\|` (the agent reaches for `a\|b` out of habit) by OR-ing
    // the escaped literal parts — otherwise it matches a literal backslash-pipe
    // and silently finds nothing.
    const source = regex
        ? pattern
        : pattern.split('\\|').map(escapeLiteral).join('|');
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
    const contents = await repoFs.readFiles(positionals);
    const lines: string[] = [];
    for (const path of positionals) {
        const content = contents.get(path) ?? null;
        if (content === null) {
            throw new ShellError(`cat: ${path}: No such file or directory`);
        }
        if (positionals.length > 1) lines.push(`==> ${path} <==`);
        lines.push(...toLines(content));
    }
    return lines;
};

const cmdFind = async (repoFs: RepoFs, tokens: string[]): Promise<string[]> => {
    // Scan manually rather than via parseArgs so we can collect MULTIPLE `-name`
    // globs (parseArgs keeps only the last). Repeated `-name`s are OR-ed, and the
    // `-o`/`-or` operators are accepted as separators — covering the common
    // `find . -name a -o -name b` idiom without a full find-expression parser.
    const nameGlobs: string[] = [];
    const positionals: string[] = [];
    let type: RepoEntryType | undefined;
    let maxDepth: number | undefined;
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === '-name') {
            const value = tokens[i + 1];
            if (value === undefined) {
                throw new ShellError('find: missing value for -name');
            }
            nameGlobs.push(value);
            i += 1;
        } else if (token === '-type') {
            const value = tokens[i + 1];
            if (value !== 'f' && value !== 'd') {
                throw new ShellError(
                    `find: unsupported -type ${value ?? ''} (use f or d)`,
                );
            }
            type = value === 'f' ? 'file' : 'dir';
            i += 1;
        } else if (token === '-maxdepth') {
            const value = tokens[i + 1];
            const depth =
                value === undefined ? NaN : Number.parseInt(value, 10);
            if (!Number.isInteger(depth) || depth < 0) {
                throw new ShellError(
                    `find: -maxdepth expects a non-negative integer (got ${
                        value ?? ''
                    })`,
                );
            }
            maxDepth = depth;
            i += 1;
        } else if (token === '-o' || token === '-or') {
            // OR separator between -name predicates; no-op (globs already OR).
        } else if (token.startsWith('-') && token.length > 1) {
            throw new ShellError(
                `find: unsupported flag ${token} (supported: -name, -type, -maxdepth, -o)`,
            );
        } else {
            positionals.push(token);
        }
    }
    const base = positionals[0] ?? '';
    return repoFs.walk(base, { type, nameGlobs, maxDepth });
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
    const contents = await repoFs.readFiles(files);
    const output: string[] = [];
    const multiFile = files.length > 1;
    for (const file of files) {
        const content = contents.get(file) ?? null;
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

const cmdHead = async (
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> => {
    // Support both `head -n N` and the `head -N` shorthand the model often uses.
    const shorthand = tokens.find((t) => /^-\d+$/.test(t));
    const { values, positionals } = parseArgs(
        tokens.filter((t) => !/^-\d+$/.test(t)),
        new Set(['-n']),
    );
    let n = 10;
    if (values.has('-n')) n = Number.parseInt(values.get('-n')!, 10);
    else if (shorthand) n = Number.parseInt(shorthand.slice(1), 10);
    if (!Number.isFinite(n) || n < 0) throw new ShellError('head: invalid -n');

    // Piped input wins (`… | head`); otherwise read the file operand(s)
    // directly, like the real `head file…` (multi-file gets `==>` banners).
    if (stdin !== null) return stdin.slice(0, n);
    if (positionals.length === 0) {
        throw new ShellError(
            'head: no input (pipe a command in, or pass a file path)',
        );
    }
    const contents = await repoFs.readFiles(positionals);
    const out: string[] = [];
    for (const path of positionals) {
        const content = contents.get(path) ?? null;
        if (content === null) {
            throw new ShellError(`head: ${path}: No such file or directory`);
        }
        if (positionals.length > 1) out.push(`==> ${path} <==`);
        out.push(...toLines(content).slice(0, n));
    }
    return out;
};

const cmdWc = async (
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> => {
    const { flags, positionals } = parseArgs(tokens, new Set());

    // Which counts to print, in wc's canonical l→w→m→c order. No flags → lines,
    // words, bytes (like bare `wc`); with flags → only the requested ones.
    const hasExplicitFlag = ['-l', '-w', '-c', '-m'].some((f) => flags.has(f));
    const selectedFlags = hasExplicitFlag
        ? ['-l', '-w', '-m', '-c'].filter((f) => flags.has(f))
        : ['-l', '-w', '-c'];
    const countLine = (lines: string[]): number[] => {
        const text = lines.join('\n');
        const values: Record<string, number> = {
            '-l': lines.length,
            '-w': text.split(/\s+/).filter(Boolean).length,
            '-m': [...text].length,
            '-c': Buffer.byteLength(text, 'utf8'),
        };
        return selectedFlags.map((f) => values[f]);
    };

    // Piped input → a single count line with no filename, like real `wc`.
    if (stdin !== null) return [countLine(stdin).join(' ')];

    if (positionals.length === 0) {
        throw new ShellError(
            'wc: no input (pipe a command in, or pass a file path)',
        );
    }

    // File operands → one `<counts> <path>` line per file (plus a `total` line
    // when there's more than one), matching real `wc`. This is what makes
    // `find … | xargs wc -l` report per-file sizes the agent can compare/sort,
    // instead of collapsing everything into a single grand total.
    const contents = await repoFs.readFiles(positionals);
    const out: string[] = [];
    const totals = selectedFlags.map(() => 0);
    for (const path of positionals) {
        const content = contents.get(path) ?? null;
        if (content === null) {
            throw new ShellError(`wc: ${path}: No such file or directory`);
        }
        const values = countLine(toLines(content));
        values.forEach((v, i) => {
            totals[i] += v;
        });
        out.push(`${values.join(' ')} ${path}`);
    }
    if (positionals.length > 1) out.push(`${totals.join(' ')} total`);
    return out;
};

const cmdSort = async (
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> => {
    const { flags, positionals } = parseArgs(tokens, new Set());
    const numeric = flags.has('-n');
    const reverse = flags.has('-r');
    const unique = flags.has('-u');

    // Piped input wins; otherwise sort the file operand(s)' lines.
    let lines: string[];
    if (stdin !== null) {
        lines = [...stdin];
    } else if (positionals.length > 0) {
        lines = [];
        const contents = await repoFs.readFiles(positionals);
        for (const path of positionals) {
            const content = contents.get(path) ?? null;
            if (content === null) {
                throw new ShellError(
                    `sort: ${path}: No such file or directory`,
                );
            }
            lines.push(...toLines(content));
        }
    } else {
        throw new ShellError(
            'sort: no input (pipe a command in, or pass a file path)',
        );
    }

    // Numeric sort keys on each line's leading number, so `wc -l` output like
    // "115 models/x.sql" orders by the count; a line without one sorts as 0.
    const numKey = (line: string): number => {
        const match = line.match(/^\s*(-?\d+(?:\.\d+)?)/);
        return match ? Number.parseFloat(match[1]) : 0;
    };
    const sorted = [...lines].sort((a, b) =>
        numeric ? numKey(a) - numKey(b) : a.localeCompare(b),
    );
    if (reverse) sorted.reverse();
    // `-u` drops adjacent duplicates (all duplicates, since the list is sorted).
    return unique
        ? sorted.filter((line, i) => i === 0 || line !== sorted[i - 1])
        : sorted;
};

async function runStage(
    repoFs: RepoFs,
    tokens: string[],
    stdin: string[] | null,
): Promise<string[]> {
    const [command, ...rest] = tokens;
    switch (command) {
        case 'ls':
            // `ls` takes no flags here; -name/-type are find's — nudge the model
            // to the right tool instead of a bare "unsupported flag".
            if (rest.includes('-name') || rest.includes('-type')) {
                throw new ShellError(
                    'ls: unsupported flag — to search by name or type use `find <dir> -name "<glob>"` (e.g. `find . -name "*.yml"`)',
                );
            }
            assertWordFlags(rest, new Set(), 'ls');
            return cmdLs(repoFs, parseArgs(rest, new Set()).positionals);
        case 'cat':
            assertWordFlags(rest, new Set(), 'cat');
            return cmdCat(repoFs, parseArgs(rest, new Set()).positionals);
        case 'find':
            assertWordFlags(
                rest,
                new Set(['-name', '-type', '-maxdepth', '-o', '-or']),
                'find',
            );
            return cmdFind(repoFs, rest);
        case 'grep':
            assertShortFlags(rest, 'rRinEl', 'grep');
            return cmdGrep(repoFs, rest, stdin);
        case 'head':
            assertWordFlags(rest, new Set(['-n']), 'head');
            return cmdHead(repoFs, rest, stdin);
        case 'wc':
            assertShortFlags(rest, 'lwcm', 'wc');
            return cmdWc(repoFs, rest, stdin);
        case 'sort':
            assertShortFlags(rest, 'rnu', 'sort');
            return cmdSort(repoFs, rest, stdin);
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
                `Unsupported command: "${command}". Available: ls, cat, find, grep, head, wc, sort, xargs.`,
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
 * Split a command line on top-level `&&`, honouring quotes so a pattern like
 * `grep 'a&&b'` stays one segment. A single `&` (background) is left untouched.
 */
const splitOnAnd = (input: string): string[] => {
    const segments: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (quote) {
            current += char;
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
            current += char;
        } else if (char === '&' && input[i + 1] === '&') {
            segments.push(current);
            current = '';
            i += 1; // consume the second '&'
        } else {
            current += char;
        }
    }
    segments.push(current);
    return segments.map((s) => s.trim()).filter((s) => s.length > 0);
};

/** Run one pipeline (`a | b | c`), returning its output and leading command. */
const runPipeline = async (
    repoFs: RepoFs,
    command: string,
): Promise<{ lines: string[]; firstCommand: string | undefined }> => {
    const stages = splitPipeline(command);
    if (stages.length === 0) throw new ShellError('Empty command');

    let stdin: string[] | null = null;
    let firstCommand: string | undefined;
    for (const stage of stages) {
        const tokens = stripRedirections(tokenize(stage));
        if (tokens.length === 0) throw new ShellError('Empty command stage');
        if (firstCommand === undefined) [firstCommand] = tokens;
        // eslint-disable-next-line no-await-in-loop
        stdin = await runStage(repoFs, tokens, stdin);
    }
    return { lines: stdin ?? [], firstCommand };
};

/**
 * Execute one read-only shell command line against the repo. Supports pipes
 * (`a | b`) and `&&` sequencing; returns combined stdout. Throws
 * {@link ShellError} for unsupported syntax — the caller surfaces the message to
 * the agent as a normal tool result.
 */
export const runRepoShellCommand = async (
    repoFs: RepoFs,
    command: string,
): Promise<string> => {
    // `&&` runs commands in sequence, stopping at the first failure (like bash):
    // each side is its own pipeline with fresh stdin and their outputs join.
    const segments = splitOnAnd(command);
    if (segments.length === 0) throw new ShellError('Empty command');

    const lines: string[] = [];
    const firstCommands: string[] = [];
    for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        const result = await runPipeline(repoFs, segment);
        lines.push(...result.lines);
        if (result.firstCommand) firstCommands.push(result.firstCommand);
    }

    // Surface a truncated tree so tree-walking commands don't read as exhaustive
    // when GitHub capped the file listing — otherwise find/grep/ls can return
    // silent false negatives on large repos.
    if (
        firstCommands.some((c) => ['find', 'grep', 'ls'].includes(c)) &&
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
