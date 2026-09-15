/**
 * What a learner has done with Learn walkthroughs, kept on the instance per
 * user (CS-186) so the library shows the same thing from any browser.
 */
export type LearnProgress = {
    /** Scopes whose walkthrough was finished (Got it on the last step). */
    completed: string[];
    /** Scopes whose walkthrough was started at least once. */
    started: string[];
    /** The scope started most recently, for the library's Resume card. */
    lastStarted: string | null;
};

export type ApiLearnProgressResponse = {
    status: 'ok';
    results: LearnProgress;
};

/**
 * Progress a browser recorded before the instance kept it: unioned into
 * what the instance holds for the user, once, without overwriting server
 * timestamps. Unknown scopes are dropped.
 */
export type MergeLearnProgressRequest = LearnProgress;
