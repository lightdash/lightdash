// Unsaved edits live for the tab only; leaving the page warns while any are kept.
export const unsavedEdits = new Map<
    string,
    { text: string; revision: string | null }
>();
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

/** An edit belongs to one file of one change; live has no pull request. */
export const unsavedEditKey = (
    projectUuid: string,
    prUrl: string | null,
    path: string | null,
) => `${projectUuid}\n${prUrl ?? ''}\n${path ?? ''}`;
