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

const slackPreview = new AsyncLocalStorage<true>();

/**
 * Marks a request the headless browser makes for a Slack link preview. The
 * preview renders as the Slack app's installer and is posted for everyone
 * in the channel, so a source that shows each viewer their own data must
 * refuse it. A client can only get itself refused by sending the header.
 */
export const slackPreviewMiddleware: RequestHandler = (req, _res, next) => {
    if (
        req.get(HEADLESS_BROWSER_CONTEXT_HEADER) !==
        SLACK_PREVIEW_SCREENSHOT_CONTEXT
    ) {
        next();
        return;
    }
    slackPreview.run(true, next);
};

/** Whether the current request renders a Slack link preview. */
export const isSlackPreview = (): boolean => slackPreview.getStore() === true;

/** Runs `run` as part of a Slack link preview, for tests. */
export const runAsSlackPreview = <T>(run: () => T): T =>
    slackPreview.run(true, run);
