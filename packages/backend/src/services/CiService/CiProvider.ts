import type { CiCheck, CiProviderType } from '@lightdash/common';

/** Auth for a CI provider call — an app installation id or a user/app token. */
export type CiProviderAuth = {
    installationId?: string;
    token?: string;
};

/**
 * A CI host strategy. The service resolves one implementation from the
 * project's source-control type and then stays host-agnostic — every
 * provider-specific mapping (GitHub Actions check runs, GitLab pipelines, …)
 * lives behind this interface. GitHub is the first and currently only adapter.
 */
export interface CiProvider {
    readonly provider: CiProviderType;

    /** Fetch the CI checks for a ref (branch name or commit SHA) in a repo. */
    getChecksForRef(args: {
        owner: string;
        repo: string;
        ref: string;
        auth: CiProviderAuth;
    }): Promise<CiCheck[]>;
}
