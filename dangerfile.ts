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
