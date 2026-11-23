type UnsavedEdit = { text: string; revision: string | null };

// Unsaved edits live for the tab only; leaving the page warns while any are kept.
const unsavedEdits = new Map<string, UnsavedEdit>();
let warnsOnLeave = false;
export const keepUnsaved = (
    key: string,
    text: string,
    revision: string | null,
) => {
    unsavedEdits.set(key, { text, revision });
    if (warnsOnLeave) return;
    warnsOnLeave = true;
    window.addEventListener('beforeunload', (event) => {
        if (unsavedEdits.size > 0) event.preventDefault();
    });
};

/** What is kept unsaved for a file; it stays kept until dropped. */
export const findUnsaved = (key: string): UnsavedEdit | null =>
    unsavedEdits.get(key) ?? null;

export const dropUnsaved = (key: string) => {
    unsavedEdits.delete(key);
};

/** Moves what is kept for one file to another, when there is any. */
export const moveUnsaved = (from: string, to: string) => {
    const kept = unsavedEdits.get(from);
    if (kept === undefined) return;
    unsavedEdits.delete(from);
    keepUnsaved(to, kept.text, kept.revision);
};

/** An edit belongs to one file of one change; live has no pull request. */
export const unsavedEditKey = (
    projectUuid: string,
    prUrl: string | null,
    path: string | null,
) => `${projectUuid}\n${prUrl ?? ''}\n${path ?? ''}`;
