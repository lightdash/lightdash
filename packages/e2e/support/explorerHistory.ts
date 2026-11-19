import { expect, type Page } from '@playwright/test';

/** The explorer store as undo sees it: the chart being built and the history around it */
export type ExplorerSnapshot = {
    chart: string;
    past: number;
    future: number;
    isSuspended: boolean;
};

// Runs in the page: finds the explorer's redux store through the React tree.
const readSnapshot = (): ExplorerSnapshot | null => {
    type Fiber = {
        memoizedProps?: { store?: { getState?: () => unknown } } | null;
        child: Fiber | null;
        sibling: Fiber | null;
    };
    type ExplorerRoot = {
        explorer: { unsavedChartVersion: unknown };
        history: { past: unknown[]; future: unknown[]; isSuspended: boolean };
    };
    const isExplorerRoot = (state: unknown): state is ExplorerRoot =>
        typeof state === 'object' &&
        state !== null &&
        'explorer' in state &&
        'history' in state;

    const root = document.getElementById('root');
    if (!root) return null;
    const containerKey = Object.keys(root).find((key) =>
        key.startsWith('__reactContainer'),
    );
    if (!containerKey) return null;
    const container: unknown = Reflect.get(root, containerKey);
    let found: ExplorerRoot | null = null;
    const stack: unknown[] = [container];
    while (stack.length > 0 && !found) {
        const fiber = stack.pop() as Fiber | null | undefined;
        if (fiber) {
            const state = fiber.memoizedProps?.store?.getState?.();
            if (isExplorerRoot(state)) found = state;
            else stack.push(fiber.sibling, fiber.child);
        }
    }
    if (!found) return null;
    return {
        chart: JSON.stringify(found.explorer.unsavedChartVersion),
        past: found.history.past.length,
        future: found.history.future.length,
        isSuspended: found.history.isSuspended,
    };
};

export const explorerSnapshot = async (
    page: Page,
): Promise<ExplorerSnapshot> => {
    const snapshot = await page.evaluate(readSnapshot);
    if (!snapshot) throw new Error('No explorer store on this page');
    return snapshot;
};

/** Waits until the chart and its history stop changing, so derived changes have landed */
export const settledExplorer = async (
    page: Page,
    { quietMs = 700, timeoutMs = 20_000 } = {},
): Promise<ExplorerSnapshot> => {
    const deadline = Date.now() + timeoutMs;
    let last = await page.evaluate(readSnapshot);
    let quietSince = Date.now();
    while (Date.now() < deadline) {
        await page.waitForTimeout(150);
        const next = await page.evaluate(readSnapshot);
        if (JSON.stringify(next) !== JSON.stringify(last)) {
            last = next;
            quietSince = Date.now();
        } else if (next && Date.now() - quietSince >= quietMs) {
            return next;
        }
    }
    if (!last) throw new Error('No explorer store on this page');
    return last;
};

const leaveTextEntry = (page: Page) =>
    page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
    });

export const undoExplorer = async (page: Page) => {
    await leaveTextEntry(page);
    await page.keyboard.press('ControlOrMeta+z');
    return settledExplorer(page);
};

export const redoExplorer = async (page: Page) => {
    await leaveTextEntry(page);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    return settledExplorer(page);
};

/**
 * Checks one user step from `before` to `after`: it is exactly one undo step,
 * undo lands on `before`, redo lands on `after`, and the chart is left at `before`.
 */
export const expectUndoableStep = async (
    page: Page,
    label: string,
    before: ExplorerSnapshot,
    after: ExplorerSnapshot,
): Promise<string[]> => {
    const findings: string[] = [];
    if (after.past !== before.past + 1)
        findings.push(
            `${label}: recorded ${after.past - before.past} steps, expected 1`,
        );
    const undone = await undoExplorer(page);
    if (undone.chart !== before.chart)
        findings.push(`${label}: undo did not restore the chart`);
    if (undone.future < 1)
        findings.push(`${label}: nothing to redo after undo`);
    const redone = await redoExplorer(page);
    if (redone.chart !== after.chart)
        findings.push(`${label}: redo did not restore the chart`);
    const restored = await undoExplorer(page);
    if (restored.chart !== before.chart)
        findings.push(`${label}: second undo did not restore the chart`);
    return findings;
};

export const expectNoSteps = (snapshot: ExplorerSnapshot, when: string) =>
    expect(snapshot.past, `undo steps recorded ${when}`).toBe(0);
