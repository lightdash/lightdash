import { test } from 'playwright/test';

/**
 * Reporting for what the plan says is "reported, not asserted" or "skipped and
 * reported, never faked". Annotations land in the HTML report; the console line
 * shows in the terminal run.
 */
const report = (type: string, message: string) => {
    test.info().annotations.push({ type, description: message });
    console.log(`[${type}] ${message}`);
};

export const reportSkippedCheck = (check: string, reason: string) =>
    report('skipped-check', `${check}: ${reason}`);

export const reportObservation = (message: string) =>
    report('observation', message);

/** Not a failure, but worth a human look: printed as its own loud line. */
export const reportWarning = (message: string) => report('WARNING', message);

export const attachJson = async (name: string, value: unknown) =>
    test.info().attach(name, {
        body: JSON.stringify(value, null, 2),
        contentType: 'application/json',
    });
