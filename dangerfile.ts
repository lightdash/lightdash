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

/**
 * Checks can return specific codes to affect the overall run.
 */
enum DangerCheckCode {
    FailAll,
}

/**
 * Expected type signature for danger checks - split into two types to make
 * it more convenient when defining a function with DangerCheck.
 */
type DangerCheck = () => (DangerCheck | void) | Promise<DangerCheckCode | void>;
type DangerCheckEntry = [description: string, DangerCheck];

/**
 * If you define a check, add it to this list.
 *
 * The order + signature is important, since some checks may fail early
 * and prevent later checks from completing.
 */
const allChecks: DangerCheckEntry[] = [] as const;

async function runAllChecks() {
    for (const [description, check] of allChecks) {
        const result = await check();

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
