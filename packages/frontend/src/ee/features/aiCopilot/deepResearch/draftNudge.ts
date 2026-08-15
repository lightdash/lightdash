// Deterministic trigger for the Deep Research nudge (a pulse on the composer's
// telescope toggle): while the user types, decide whether the draft looks like
// an investigation rather than a lookup. No LLM involved — this must be
// instant and cheap on every keystroke.

// Stems take \w* so "analyze"/"analysis", "investigate", "comparing",
// "declining" all match; bare words stay exact so "drop" ≠ "dropdown".
const INVESTIGATIVE_MARKERS =
    /\b(why|what(?:'s| is) (?:driving|causing|behind)|analy\w*|investigat\w*|compar\w*|deep.?dive|thorough|evidence|root.?cause|report|driv(?:ing|ers?)|trends? over|churn\w*|declin\w*|drops?)\b/i;

const MIN_WORDS = 12;

export const isDeepResearchDraft = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.split(/\s+/).length < MIN_WORDS) return false;
    return INVESTIGATIVE_MARKERS.test(trimmed);
};

// Suppression: the nudge appears at most once per scope (a thread, or the
// new-thread composer), and any dismissal silences it for the rest of the
// browser session. sessionStorage only — nothing persists server-side.

const SESSION_DISMISSED_KEY = 'lightdash:deepResearchNudge:dismissed';
const shownKey = (scope: string) =>
    `lightdash:deepResearchNudge:shown:${scope}`;

const safeGet = (key: string): string | null => {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSet = (key: string) => {
    try {
        sessionStorage.setItem(key, '1');
    } catch {
        // Storage unavailable — the nudge may repeat, which is harmless.
    }
};

export const canShowDeepResearchNudge = (scope: string): boolean =>
    safeGet(SESSION_DISMISSED_KEY) === null &&
    safeGet(shownKey(scope)) === null;

export const markDeepResearchNudgeShown = (scope: string) => {
    safeSet(shownKey(scope));
};

export const dismissDeepResearchNudgeForSession = () => {
    safeSet(SESSION_DISMISSED_KEY);
};
