import {
    assertUnreachable,
    type SemanticLayerBlocker,
} from '@lightdash/common';
import { Anchor } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';

/** Why the models cannot be changed here, for someone who would otherwise expect to; null when there is nothing to tell. */
export const describeBlocker = (blocker: SemanticLayerBlocker): ReactNode => {
    switch (blocker) {
        // Someone without the right to deploy has nothing to be told.
        case 'no_access':
            return null;
        case 'unsupported_connection':
            return "Read-only. This dbt connection can't be written to.";
        case 'no_repository_access':
            return 'Read-only. You need write access to the repository.';
        case 'github_app_missing':
            return (
                <>
                    Read-only until the GitHub App is installed.{' '}
                    <Anchor
                        component={Link}
                        to="/generalSettings/integrations"
                        inherit
                    >
                        Install it
                    </Anchor>
                </>
            );
        case 'models_from_outside':
            return 'Read-only. These models were deployed from outside this app.';
        case 'preview_project':
            return 'Read-only. This is a preview of a pull request.';
        default:
            return assertUnreachable(blocker, 'Unknown blocker');
    }
};

/** Whether deploying models with the CLI is open to this person and would land for this project. */
export const deploysWithCli = (
    blocker: SemanticLayerBlocker | null,
): boolean => {
    if (blocker === null) return true;
    switch (blocker) {
        // Models deployed from outside came from the CLI, so it is still the way in.
        case 'models_from_outside':
            return true;
        case 'no_access':
        case 'preview_project':
        // The models come from the connected repository, not a deploy.
        case 'unsupported_connection':
        case 'no_repository_access':
        case 'github_app_missing':
            return false;
        default:
            return assertUnreachable(blocker, 'Unknown blocker');
    }
};
