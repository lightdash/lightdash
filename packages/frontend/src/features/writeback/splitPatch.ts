export type DiffFile = {
    key: string;
    /** Full b-side path, e.g. `dbt/models/customers.yml`. */
    path: string;
    patch: string;
    additions: number;
    deletions: number;
    isNew: boolean;
};

/** The lines a patch adds (`+`) or removes (`-`), not counting its file headers. */
export const countPatchLines = (patch: string, sign: '+' | '-') =>
    patch
        .split('\n')
        .filter(
            (line) => line.startsWith(sign) && !line.startsWith(sign.repeat(3)),
        ).length;

/** The file a patch is for, from its `+++` line. */
export const patchPathOf = (patch: string) =>
    /^\+\+\+ (?:b\/)?(\S+)/m.exec(patch)?.[1] ?? null;

/** Whether a repository path is the project path, which may sit below the repository root. */
export const isSameFile = (repositoryPath: string, projectPath: string) =>
    repositoryPath === projectPath ||
    repositoryPath.endsWith(`/${projectPath}`);

// `PatchDiff` renders exactly one file, so a multi-file PR diff is split into
// its per-file sections (each starts with a `diff --git` line). We also tally
// each section's +/- so the file list can show a per-file stat. The b-side path
// keys each file; an index suffix guards two sections resolving to the same
// name (e.g. a rename pair).
export const splitPatchIntoFiles = (patch: string): DiffFile[] =>
    patch
        .split(/\n(?=diff --git )/g)
        .map((section) => section.trim())
        .filter(Boolean)
        .map((section, index) => {
            const path =
                section.match(/^diff --git a\/.+? b\/(.+)$/m)?.[1] ?? 'file';
            return {
                key: `${path}-${index}`,
                path,
                patch: section,
                additions: countPatchLines(section, '+'),
                deletions: countPatchLines(section, '-'),
                isNew: section.includes('\nnew file mode'),
            };
        });

/** `models/customers.yml` belongs to the model `customers`. */
export const getModelOfFile = ({ path }: Pick<DiffFile, 'path'>): string =>
    (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/** The models a diff's files under a models folder belong to. */
export const getModelsOfFiles = (files: Pick<DiffFile, 'path'>[]): string[] =>
    [
        ...new Set(
            files
                .filter(({ path }) =>
                    /(^|\/)models\/.+\.(ya?ml|sql)$/.test(path),
                )
                .map(getModelOfFile),
        ),
    ].sort();

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

const endsHunk = (lines: string[], i: number) =>
    lines[i].startsWith('@@ ') ||
    lines[i].startsWith('diff --git ') ||
    (lines[i].startsWith('--- ') && !!lines[i + 1]?.startsWith('+++ '));

/** A patch whose hunk headers count the lines each hunk really has, since agents miscount them; a blank line inside a hunk is unchanged context. */
export const recountHunks = (patch: string): string => {
    const lines = patch.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const header = HUNK_HEADER.exec(lines[i]);
        if (!header) {
            out.push(lines[i]);
            i += 1;
        } else {
            let end = i + 1;
            while (end < lines.length && !endsHunk(lines, end)) end += 1;
            let last = end;
            while (last > i + 1 && lines[last - 1] === '') last -= 1;
            const body = lines
                .slice(i + 1, last)
                .map((line) => (line === '' ? ' ' : line));
            const count = (sign: string) =>
                body.filter((line) => line[0] === ' ' || line[0] === sign)
                    .length;
            const [, from, to, rest] = header;
            out.push(
                `@@ -${from},${count('-')} +${to},${count('+')} @@${rest}`,
                ...body,
                ...lines.slice(last, end),
            );
            i = end;
        }
    }
    return out.join('\n');
};
