/**
 * The project the learner opened the library from. Walkthroughs run in a
 * copy of the training project, and the copy is put away when they end;
 * the learner is sent back here rather than to the training project, so
 * Learn is a detour from their own work, not a move. Kept per tab: a new
 * tab that lands straight in a copy falls back to the training project.
 */
const ORIGIN_KEY = 'lightdash.learn.origin';

export const rememberLearnOrigin = (projectUuid: string) => {
    try {
        sessionStorage.setItem(ORIGIN_KEY, projectUuid);
    } catch {
        // Storage unavailable (private mode, quota): the training project
        // is where the learner returns to, as before.
    }
};

export const readLearnOrigin = (): string | null => {
    try {
        return sessionStorage.getItem(ORIGIN_KEY);
    } catch {
        return null;
    }
};
