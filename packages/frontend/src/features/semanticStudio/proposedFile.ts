import { patchPathOf } from '../writeback/splitPatch';

const findBlock = (lines: string[], block: string[], from: number) => {
    const fits = (at: number) =>
        block.every((line, i) => lines[at + i]?.trimEnd() === line.trimEnd());
    for (let at = from; at + block.length <= lines.length; at += 1) {
        if (fits(at)) return at;
    }
    for (let at = 0; at < from; at += 1) {
        if (fits(at)) return at;
    }
    return -1;
};

/** The file with the agent's proposed hunks applied, matched by content since its line numbers are not trusted; null when none is for this file or it no longer fits. */
export const applyProposal = (
    proposal: string[],
    path: string,
    content: string,
): string | null => {
    const patch = proposal.find((code) => patchPathOf(code) === path);
    if (!patch) return null;
    const hunks = patch.split(/^@@[^\n]*$/m).slice(1);
    const lines = content.split('\n');
    let from = 0;
    for (const hunk of hunks) {
        const body = hunk
            .replace(/^\n/, '')
            .replace(/\n$/, '')
            .split('\n')
            .filter((line) => !line.startsWith('\\'));
        const old = body
            .filter((line) => !line.startsWith('+'))
            .map((line) => line.slice(1));
        const next = body
            .filter((line) => !line.startsWith('-'))
            .map((line) => line.slice(1));
        const at = old.length > 0 ? findBlock(lines, old, from) : -1;
        if (at === -1) return null;
        lines.splice(at, old.length, ...next);
        from = at + next.length;
    }
    const applied = lines.join('\n');
    return hunks.length > 0 && applied !== content ? applied : null;
};

/** The file before a change, from the file after it and the change's patch; null when the patch no longer fits. */
export const fileBefore = (patch: string, path: string, after: string) => {
    const start = patch.search(/^@@/m);
    if (start === -1) return null;
    const flipped = patch
        .slice(start)
        .split('\n')
        .map((line) =>
            line.startsWith('+')
                ? `-${line.slice(1)}`
                : line.startsWith('-')
                  ? `+${line.slice(1)}`
                  : line,
        )
        .join('\n');
    return applyProposal([`+++ ${path}\n${flipped}`], path, after);
};
