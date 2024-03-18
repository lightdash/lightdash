import { danger, fail, markdown, message, warn } from 'danger';

/**
 * Base type used to annotate all danger checks.
 */
enum CheckCode {
    FailAll,
}

type DangerCheck = [description: string, () => Promise<CheckCode | void>];

const allChecks: DangerCheck[] = [] as const;

async function runAllChecks() {
    for (const [description, check] of allChecks) {
        const result = await check();

        /**
         * Handle special cases for check return values; the default behavior is
         * to keep going through all checks.
         */
        switch (result) {
            case CheckCode.FailAll:
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
