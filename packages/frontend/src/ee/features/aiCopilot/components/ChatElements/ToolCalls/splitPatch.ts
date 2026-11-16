export type DiffFile = {
    key: string;
    /** Full b-side path, e.g. `dbt/models/customers.yml`. */
    path: string;
    patch: string;
    additions: number;
    deletions: number;
};

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
            let additions = 0;
            let deletions = 0;
            for (const line of section.split('\n')) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    additions += 1;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    deletions += 1;
                }
            }
            return {
                key: `${path}-${index}`,
                path,
                patch: section,
                additions,
                deletions,
            };
        });
