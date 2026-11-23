import { JWT_HEADER_NAME } from '@lightdash/common';
import { type Request, type Response } from 'express';
import { ScreenshotContext } from '../../../services/UnfurlService/UnfurlService';
import {
    borrowedIdentityMiddleware,
    getBorrowedIdentity,
    HEADLESS_BROWSER_CONTEXT_HEADER,
    runWithBorrowedIdentity,
    SLACK_PREVIEW_SCREENSHOT_CONTEXT,
    type BorrowedIdentity,
} from './borrowedIdentity';

const requestWith = (headers: Record<string, string>) =>
    ({
        get: (name: string) =>
            Object.entries(headers).find(
                ([key]) => key.toLowerCase() === name.toLowerCase(),
            )?.[1],
    }) as unknown as Request;

const seenBy = (headers: Record<string, string>) => {
    let seen: BorrowedIdentity | null | undefined;
    borrowedIdentityMiddleware(requestWith(headers), {} as Response, () => {
        seen = getBorrowedIdentity();
    });
    return seen;
};

describe('borrowedIdentityMiddleware', () => {
    it('matches the context the headless browser sends for Slack', () => {
        expect(SLACK_PREVIEW_SCREENSHOT_CONTEXT).toBe(ScreenshotContext.SLACK);
    });

    it('marks only Slack link previews among screenshots', () => {
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]: ScreenshotContext.SLACK,
            }),
        ).toBe('slack_preview');
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]:
                    ScreenshotContext.SCHEDULED_DELIVERY,
            }),
        ).toBeNull();
        // A data app the AI agent captures runs as the person who asked
        expect(
            seenBy({
                [HEADLESS_BROWSER_CONTEXT_HEADER]:
                    ScreenshotContext.AI_AGENT_SLACK,
            }),
        ).toBeNull();
    });

    it('marks requests that carry an embed token', () => {
        expect(seenBy({ [JWT_HEADER_NAME]: 'token' })).toBe('embed');
    });

    it('leaves a person’s own requests alone', () => {
        expect(seenBy({})).toBeNull();
        expect(getBorrowedIdentity()).toBeNull();
    });

    it('keeps the mark through work that finishes later', async () => {
        const seen = await runWithBorrowedIdentity('slack_agent', async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            return getBorrowedIdentity();
        });
        expect(seen).toBe('slack_agent');
        expect(getBorrowedIdentity()).toBeNull();
    });
});
