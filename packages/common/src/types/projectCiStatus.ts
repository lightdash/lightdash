/**
 * Per-project record of whether a project's git repo has Lightdash CI/CD set
 * up. Populated as a secondary task of the AI writeback sandbox agent: while it
 * has the repo cloned it scans `.github/workflows/` for a Lightdash
 * preview-deploy workflow and persists the result so we don't re-scan a project
 * that already has it set up.
 */
export type ProjectCiStatus = {
    projectUuid: string;
    hasPreviewDeployWorkflow: boolean;
    /** Path of the detected workflow file, or null when none was found. */
    workflowPath: string | null;
    /** Repo HEAD commit the scan ran against, for debugging staleness. */
    detectedCommitSha: string | null;
    checkedAt: Date;
};

/**
 * CI status for a project, or null when the project has never been scanned
 * (e.g. no AI writeback has run yet). A null result means "unknown", which is
 * distinct from a record with `hasPreviewDeployWorkflow: false` ("scanned, no
 * preview workflow").
 */
export type ApiProjectCiStatusResponse = {
    status: 'ok';
    results: ProjectCiStatus | null;
};
