import { type Request, type Response } from 'express';
import { ScreenshotContext } from '../../../services/UnfurlService/UnfurlService';
import {
    HEADLESS_BROWSER_CONTEXT_HEADER,
    isSlackPreview,
    SLACK_PREVIEW_SCREENSHOT_CONTEXT,
    slackPreviewMiddleware,
} from './slackPreview';

const requestWith = (headers: Record<string, string>) =>
    ({
        get: (name: string) =>
            Object.entries(headers).find(
                ([key]) => key.toLowerCase() === name.toLowerCase(),
            )?.[1],
    }) as unknown as Request;

const seenBy = (headers: Record<string, string>) => {
    let seen: boolean | undefined;
    slackPreviewMiddleware(requestWith(headers), {} as Response, () => {
        seen = isSlackPreview();
    });
    return seen;
};

describe('slackPreviewMiddleware', () => {
    it('matches the context the headless browser sends for Slack', () => {
        expect(SLACK_PREVIEW_SCREENSHOT_CONTEXT).toBe(ScreenshotContext.SLACK);
    });

    it('marks only Slack link previews', () => {
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]: ScreenshotContext.SLACK,
            }),
        ).toBe(true);
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]:
                    ScreenshotContext.SCHEDULED_DELIVERY,
            }),
        ).toBe(false);
        // A data app the AI agent captures runs as the person who asked
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]:
                    ScreenshotContext.AI_AGENT_SLACK,
            }),
        ).toBe(false);
        expect(seenBy({})).toBe(false);
        expect(isSlackPreview()).toBe(false);
    });
});
