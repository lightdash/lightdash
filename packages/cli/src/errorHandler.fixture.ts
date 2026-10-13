import {
    ForbiddenError,
    getErrorMessage,
    LightdashError,
} from '@lightdash/common';
import { program } from 'commander';
import { getAgentConnectionSelection } from './credentials';
import { NODE_VERSION, OPTIMIZED_NODE_VERSION } from './env';
import { getDiagnosticsHint } from './error';
import * as styles from './styles';

export const errorHandler = (err: Error) => {
    const errorMessage = getErrorMessage(err) || 'An unexpected error occurred';
    console.error(styles.error(errorMessage));

    if (err.name === 'ForbiddenError' || err instanceof ForbiddenError) {
        const permissionMessage =
            err.message || "You don't have permission to perform this action";
        if (permissionMessage !== errorMessage) {
            console.error(styles.error(permissionMessage));
        }
        console.error(
            `\n💡 Contact your Lightdash administrator to request project creation access or if you believe this is incorrect.\n`,
        );
    } else if (
        err.name === 'AuthorizationError' &&
        program.opts().agentConnection === undefined &&
        getAgentConnectionSelection() === null
    ) {
        console.error(
            `Looks like you did not authenticate or the personal access token expired.${
                process.env.LIGHTDASH_API_KEY
                    ? `\n\nLIGHTDASH_API_KEY is set, and it takes precedence over the token saved by \`lightdash login\`. If you expected your saved login to be used, run ${styles.bold(
                          'unset LIGHTDASH_API_KEY',
                      )}.`
                    : ''
            }\n\n👀 See https://docs.lightdash.com/guides/cli/cli-authentication for help and examples`,
        );
    } else if (!(err instanceof LightdashError)) {
        console.error(err);
        if (err.stack) {
            console.error(err.stack);
        }
        console.error('\nReport this issue with 1-click:\n');
        console.error(
            `  🐛 https://github.com/lightdash/lightdash/issues/new?assignees=&labels=🐛+bug&template=bug_report.md&title=${encodeURIComponent(
                err.message,
            )}`,
        );
    }
    if (err.message.includes('ENOENT: dbt')) {
        console.error(
            styles.error(
                `\n You must have dbt installed to use this command. See https://docs.getdbt.com/docs/core/installation for installation instructions`,
            ),
        );
    }
    const diagnosticsHint = getDiagnosticsHint();
    if (diagnosticsHint) {
        console.error(diagnosticsHint);
    }
    if (NODE_VERSION.major !== OPTIMIZED_NODE_VERSION) {
        console.warn(
            styles.warning(
                `⚠️ You are using Node.js version ${process.version}. Lightdash CLI is optimized for v${OPTIMIZED_NODE_VERSION} so you might experience issues.`,
            ),
        );
    }
    process.exit(1);
};
