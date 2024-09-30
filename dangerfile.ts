/**
 * Learn more about writing dangerjs rules here:
 * https://danger.systems/js/reference
 *
 * Please always:
 *
 * - Define your check using the `DangerCheck` type annotation:
 *
 *  ```ts
 *      const mySanityCheck: DangerCheck = () => {
 *          ...
 *      }
 *  ```
 *
 * - Add your check function to the `allChecks` list, with a description:
 *
 *  ```ts
 *  const allChecks: DangerCheckEntry[] = [
 *      ['Runs a critical sanity check', mySanityCheck]
 *  ] as const;
 *  ```
 *
 * - Use the `fail`, `message` and `warn` helpers, ideally with the correct filename
 *   and lines, as well as detailed descriptions on the actions required or what the
 *   exact problem is.
 */
import { danger, fail, markdown, message, warn } from 'danger';
import { existsSync } from 'fs';

/**
 * Looks for and executes repo/local dangerfiles.
 *
 * All function exports on the module are assumed to be checks, and executed.
 */
const runRepoChecks: DangerCheck = async () => {};

/**
 * Checks can return specific codes to affect the overall run.
 */
export enum DangerCheckCode {
    FailAll,
}

/**
 * Expected type signature for danger checks - split into two types to make
 * it more convenient when defining a function with DangerCheck.
 */
interface DangerCheckArgs {
    fail: typeof fail;
    markdown: typeof markdown;
    danger: typeof danger;
    message: typeof message;
    warn: typeof warn;
}

export type DangerCheck = (
    args: DangerCheckArgs,
) => (DangerCheck | void) | Promise<DangerCheckCode | void>;

type DangerCheckEntry = [description: string, DangerCheck];

/**
 * If you define a check, add it to this list.
 *
 * The order + signature is important, since some checks may fail early
 * and prevent later checks from completing.
 */
const checks: DangerCheckEntry[] = [
    ['Run local or repository-specific checks', runRepoChecks],
] as const;

async function runAllChecks() {
    /**
     * A list of possible additional dangerfiles:
     */
    const repoFilePaths = [
        './dangerfile.repo.ts',
        './dangerfile.development.ts',
    ];

    /**
     * Check if any of the local dangerfiles exist, and if so, include their
     * exports as additional checks.
     */
    let localChecks: DangerCheckEntry[] = [];
    for (const repoDangerfile of repoFilePaths) {
        if (existsSync(repoDangerfile)) {
            console.log(`Danger: 🔍 including checks from '${repoDangerfile}'`);
            const mod = await import(repoDangerfile);

            localChecks = [
                ...localChecks,
                ...(Object.entries(mod).filter(
                    ([_, fn]) => typeof fn === 'function',
                ) as DangerCheckEntry[]),
            ];
        }
    }

    const mergedChecks = [...localChecks, ...checks];

    for (const [description, check] of mergedChecks) {
        const result = await check({
            danger,
            fail,
            markdown,
            message,
            warn,
        });

        /**
         * Handle special cases for check return values; the default behavior is
         * to keep going through all checks.
         */
        switch (result) {
            case DangerCheckCode.FailAll:
                console.warn(
                    `Check '${description}' returned FailAll, not completing remaining checks`,
                );
                break;
        }
    }
}

runAllChecks()
    .finally(() => console.log('Finished running danger'))
    .catch((err) => {
        throw err;
    });
