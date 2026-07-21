/**
 * Behavioral rubric over one benchmark run: transcript-shape rules (does the
 * model follow the skill's workflow contract) plus mechanical quality gates
 * on the generated source. Every rule is a boolean; the runner aggregates
 * pass rates across repetitions — a rule that holds in 5/5 runs is working,
 * one that flips per run isn't.
 */
import type { StreamAnalysis } from './stream.ts';

export type PromptSpec = {
    id: string;
    prompt: string;
    prepend?: string;
    sandboxFiles?: Record<string, string>;
    mustRead: string[];
    mustNotRead: string[];
};

export type RuleResults = Record<string, boolean>;

const PLACEHOLDER_MARKER = 'Lightdash Data App Placeholder';
const MAX_FILE_LINES = 350;

const inputPath = (input: Record<string, unknown>): string =>
    String(input.file_path ?? '');

/**
 * The Claude CLI executes read-only Bash (find/cat/grep/ls) in the sandbox
 * regardless of --allowedTools, so exploration via Bash is a fact of life,
 * not a violation. What the rubric flags is Bash that can MUTATE state or
 * run arbitrary programs — anything beyond `pnpm check` and plain file
 * inspection.
 */
const isMutatingBash = (command: string): boolean => {
    if (command.startsWith('pnpm check')) return false;
    return /\b(mkdir|cp|mv|rm|touch|tee|chmod|chown|ln|sed\s+-i|npm|npx|node|pnpm)\b/.test(
        command,
    );
};

/** Rules derived from the transcript alone. */
export function transcriptRules(
    analysis: StreamAnalysis,
    spec: PromptSpec,
): RuleResults {
    const writes = analysis.toolCalls.filter((t) => t.name === 'Write');
    const reads = analysis.toolCalls.filter((t) => t.name === 'Read');
    const bashes = analysis.toolCalls.filter((t) => t.name === 'Bash');

    const writtenPaths: string[] = [];
    let rewrote = false;
    for (const w of writes) {
        const p = inputPath(w.input);
        if (writtenPaths.includes(p)) rewrote = true;
        writtenPaths.push(p);
    }

    const readPaths = reads.map((r) => inputPath(r.input));
    const readBack = analysis.toolCalls.some((t, i) => {
        if (t.name !== 'Read') return false;
        const p = inputPath(t.input);
        return analysis.toolCalls
            .slice(0, i)
            .some(
                (prev) =>
                    (prev.name === 'Write' || prev.name === 'Edit') &&
                    inputPath(prev.input) === p,
            );
    });

    return {
        // Multi-file / no-monolith contract
        'no-rewrite-of-written-file': !rewrote,
        'no-read-back-of-own-writes': !readBack,
        'multiple-source-files': writtenPaths.length >= 2,
        // Template-lib cheat sheet: those files are documented — neither Read
        // nor inspected via Bash (cat/sed/grep on src/lib counts too)
        'no-template-lib-reads':
            !readPaths.some((p) => p.startsWith('/app/src/lib/')) &&
            !bashes.some((b) =>
                String(b.input.command ?? '').includes('src/lib'),
            ),
        // Verification loop ran; Bash never mutated state or ran programs
        // beyond `pnpm check` (read-only exploration is tolerated — the CLI
        // executes it regardless of --allowedTools)
        'ran-pnpm-check': bashes.some((b) =>
            String(b.input.command ?? '').startsWith('pnpm check'),
        ),
        'no-mutating-bash': bashes.every(
            (b) => !isMutatingBash(String(b.input.command ?? '')),
        ),
        'no-denied-tools': analysis.deniedTools.length === 0,
        // Progressive disclosure discipline
        'reads-required-references': spec.mustRead.every((p) =>
            readPaths.includes(p),
        ),
        'skips-irrelevant-references': !spec.mustNotRead.some((p) =>
            readPaths.includes(p),
        ),
    };
}

/**
 * Mechanical quality gates on the downloaded /app/src tree
 * (path → file content).
 */
export function sourceRules(files: Record<string, string>): RuleResults {
    const sourceFiles = Object.entries(files).filter(
        ([p]) =>
            /\.(jsx|tsx|js|ts)$/.test(p) &&
            !p.includes('/lib/') &&
            !p.includes('/components/ui/'),
    );

    const appEntry = Object.entries(files).find(([p]) =>
        /src\/App\.(jsx|tsx)$/.test(p),
    );

    let axesOk = true;
    for (const [, content] of sourceFiles) {
        for (const match of content.matchAll(/<([XY]Axis)\b/g)) {
            const start = match.index ?? 0;
            const end = content.indexOf('>', start);
            const tag = content.slice(start, end === -1 ? undefined : end + 1);
            if (!/tickFormatter|hide/.test(tag)) {
                axesOk = false;
            }
        }
    }

    const oversized = sourceFiles.filter(
        ([, content]) => content.split('\n').length > MAX_FILE_LINES,
    );

    return {
        'not-placeholder-app': appEntry
            ? !appEntry[1].includes(PLACEHOLDER_MARKER)
            : false,
        'no-oversized-files': oversized.length === 0,
        'axes-have-tick-formatters': axesOk,
    };
}
