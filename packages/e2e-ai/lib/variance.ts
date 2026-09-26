import { assertUnreachable } from '@lightdash/common';
import { attachJson, reportObservation } from './report';

/**
 * One attempt of a variance-prone (V) test. Deterministic invariants throw
 * inside the attempt and fail on the first try; only the assertions the plan
 * calls variance-prone come back as `variance`, with the ledger read for them.
 */
export type AttemptResult =
    | { kind: 'pass' }
    | { kind: 'variance'; assertion: string; ledger: unknown };

type Variance = Extract<AttemptResult, { kind: 'variance' }>;

const ATTEMPTS: readonly (1 | 2)[] = [1, 2];

/**
 * Plan §5: retry once. A pass on retry is logged as variance with the first
 * attempt's ledger attached; two variance results fail the test.
 */
export const retryOnceOnVariance = async (
    attempt: (attemptNumber: 1 | 2) => Promise<AttemptResult>,
) => {
    let previous: Variance | null = null;
    for (const attemptNumber of ATTEMPTS) {
        const result = await attempt(attemptNumber);
        switch (result.kind) {
            case 'pass':
                if (previous !== null) {
                    reportObservation(
                        `passed on retry; attempt 1 is logged as variance (${previous.assertion})`,
                    );
                }
                return;
            case 'variance':
                await attachJson(
                    `attempt ${attemptNumber} ledger: ${result.assertion}`,
                    result.ledger,
                );
                if (previous !== null) {
                    throw new Error(
                        `Failed twice. Attempt 1: ${previous.assertion}. Attempt 2: ${result.assertion}`,
                    );
                }
                reportObservation(
                    `attempt 1 failed a variance-prone assertion (${result.assertion}); retrying once`,
                );
                previous = result;
                break;
            default:
                assertUnreachable(result, 'Unknown attempt result');
        }
    }
};
