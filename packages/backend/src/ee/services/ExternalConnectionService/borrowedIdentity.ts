import { JWT_HEADER_NAME } from '@lightdash/common';
import { type RequestHandler } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Sent with every request the headless browser makes for a screenshot,
 * naming what the screenshot is for (UnfurlService's ScreenshotContext).
 */
export const HEADLESS_BROWSER_CONTEXT_HEADER =
    'Lightdash-Headless-Browser-Context';

/** ScreenshotContext.SLACK: a link preview posted to a Slack channel. */
export const SLACK_PREVIEW_SCREENSHOT_CONTEXT = 'slack';

/**
 * Work that runs as one person and answers someone else:
 * - `slack_preview`: a link preview renders as the Slack app's installer and
 *   is posted for everyone in the channel
 * - `slack_agent`: the Slack agent answers as the installer when the
 *   workspace does not sign people in to Lightdash
 * - `embed`: an embed, and the agent inside it, answer whoever holds the
 *   embed token
 */
export type BorrowedIdentity = 'slack_preview' | 'slack_agent' | 'embed';

const borrowedIdentity = new AsyncLocalStorage<BorrowedIdentity>();

const getRequestBorrowedIdentity = (
    req: Parameters<RequestHandler>[0],
): BorrowedIdentity | null => {
    if (
        req.get(HEADLESS_BROWSER_CONTEXT_HEADER) ===
        SLACK_PREVIEW_SCREENSHOT_CONTEXT
    ) {
        return 'slack_preview';
    }
    return req.get(JWT_HEADER_NAME) ? 'embed' : null;
};

/**
 * Marks requests that answer someone other than the account they run as, so
 * a source that shows each viewer their own data can refuse them. Both are
 * read from a header, and a client can only get itself refused by sending one.
 */
export const borrowedIdentityMiddleware: RequestHandler = (req, _res, next) => {
    const who = getRequestBorrowedIdentity(req);
    if (who === null) {
        next();
        return;
    }
    borrowedIdentity.run(who, next);
};

/** Whose identity the current work borrows, or null when it is the viewer's own. */
export const getBorrowedIdentity = (): BorrowedIdentity | null =>
    borrowedIdentity.getStore() ?? null;

/** Runs `run` as work that answers someone other than its account. */
export const runWithBorrowedIdentity = <T>(
    who: BorrowedIdentity,
    run: () => T,
): T => borrowedIdentity.run(who, run);
