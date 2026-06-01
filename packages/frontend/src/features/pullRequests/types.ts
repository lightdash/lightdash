import { type PullRequestWithStatus } from '@lightdash/common';

export type PullRequestAuthor = {
    userUuid: string;
    name: string;
    email: string;
};

/**
 * A pull request row ready for rendering: the API row plus the resolved author
 * (from org members). `author` is null when the creator is unknown or not an
 * org member.
 */
export type PullRequestRow = PullRequestWithStatus & {
    author: PullRequestAuthor | null;
};
