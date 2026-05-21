import { PartialFailureType, type PartialFailure } from '@lightdash/common';
import { KnownBlock } from '@slack/bolt';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getDashboardCsvResultsBlocks,
} from './SlackMessageBlocks';

const SLACK_MAX_BLOCKS = 50;
const SLACK_MAX_URL = 3000;

const findBlocks = <T extends KnownBlock['type']>(
    blocks: KnownBlock[],
    type: T,
): Extract<KnownBlock, { type: T }>[] =>
    blocks.filter(
        (b): b is Extract<KnownBlock, { type: T }> => b.type === type,
    );

describe('SlackMessageBlocks', () => {
    describe('block count cap (PROD-7209)', () => {
        it('caps a dashboard with 60 chart downloads under Slack 50-block limit', () => {
            const csvUrls = Array.from({ length: 60 }, (_, i) => ({
                filename: `chart-${i}.csv`,
                path: `https://s3.example.com/exports/chart-${i}.csv`,
                localPath: `/tmp/chart-${i}.csv`,
                truncated: false,
            }));

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Big dashboard',
                name: 'Big dashboard',
                description: 'Many charts',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
                footerMarkdown: 'sent by scheduler',
            });

            expect(blocks.length).toBeLessThan(SLACK_MAX_BLOCKS);
        });

        it('includes a summary indicator when dashboard charts exceed the cap', () => {
            const csvUrls = Array.from({ length: 60 }, (_, i) => ({
                filename: `chart-${i}.csv`,
                path: `https://s3.example.com/exports/chart-${i}.csv`,
                localPath: `/tmp/chart-${i}.csv`,
                truncated: false,
            }));

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Big dashboard',
                name: 'Big dashboard',
                description: 'Many charts',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
                footerMarkdown: 'sent by scheduler',
            });

            const sections = findBlocks(blocks, 'section');
            const sectionTexts = sections
                .map((s) => s.text?.text ?? '')
                .join('\n');
            expect(sectionTexts).toMatch(/more|additional|view in lightdash/i);
        });

        it('embeds per-chart download links in the collapsed section as mrkdwn', () => {
            const csvUrls = Array.from({ length: 60 }, (_, i) => ({
                filename: `chart-${i}.csv`,
                path: `https://s3.example.com/exports/chart-${i}.csv`,
                localPath: `/tmp/chart-${i}.csv`,
                truncated: false,
            }));

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Big dashboard',
                name: 'Big dashboard',
                description: 'Many charts',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
            });

            const sectionTexts = findBlocks(blocks, 'section')
                .map((s) => s.text?.text ?? '')
                .join('\n');
            expect(sectionTexts).toMatch(
                /<https:\/\/s3\.example\.com\/exports\/chart-0\.csv\|chart-0\.csv>/,
            );
        });

        it('marks invalid per-chart URLs in the collapsed section without a link', () => {
            const csvUrls = [
                ...Array.from({ length: 35 }, (_, i) => ({
                    filename: `chart-${i}.csv`,
                    path: `https://s3.example.com/exports/chart-${i}.csv`,
                    localPath: `/tmp/chart-${i}.csv`,
                    truncated: false,
                })),
                {
                    filename: 'oversized.csv',
                    path: `https://s3.example.com/${'a'.repeat(
                        SLACK_MAX_URL + 100,
                    )}`,
                    localPath: '/tmp/oversized.csv',
                    truncated: false,
                },
            ];

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Big dashboard',
                name: 'Big dashboard',
                description: 'Many charts',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
            });

            const sectionTexts = findBlocks(blocks, 'section')
                .map((s) => s.text?.text ?? '')
                .join('\n');
            // The invalid URL must not appear linked.
            expect(sectionTexts).not.toMatch(/oversized\.csv\|oversized\.csv>/);
        });

        it('does not collapse when the dashboard has only a few charts', () => {
            const csvUrls = Array.from({ length: 3 }, (_, i) => ({
                filename: `chart-${i}.csv`,
                path: `https://s3.example.com/exports/chart-${i}.csv`,
                localPath: `/tmp/chart-${i}.csv`,
                truncated: false,
            }));

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Small dashboard',
                name: 'Small dashboard',
                description: 'A few charts',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
                footerMarkdown: 'sent by scheduler',
            });

            const actionsButtons = blocks.filter(
                (b) =>
                    b.type === 'section' &&
                    'accessory' in b &&
                    b.accessory?.type === 'button',
            );
            expect(actionsButtons.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('button URL validation', () => {
        it('drops the chart-CSV download button when csvUrl exceeds 3000 chars', () => {
            const longCsvUrl = `https://s3.example.com/${'a'.repeat(
                SLACK_MAX_URL + 100,
            )}`;

            const blocks = getChartCsvResultsBlocks({
                name: 'Big chart',
                title: 'Big chart',
                description: 'Big chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                csvUrl: longCsvUrl,
            });

            const buttons = blocks.flatMap((b) =>
                b.type === 'actions' ? b.elements : [],
            );
            const downloadButtons = buttons.filter(
                (e) => 'action_id' in e && e.action_id === 'download-results',
            );
            expect(downloadButtons).toHaveLength(0);
        });

        it('drops the Open-in-Lightdash button when ctaUrl exceeds 3000 chars', () => {
            const longCta = `https://app.example.com/${'a'.repeat(
                SLACK_MAX_URL + 100,
            )}`;

            const blocks = getChartAndDashboardBlocks({
                title: 'Chart',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: longCta,
            });

            const sections = findBlocks(blocks, 'section');
            const accessories = sections
                .map((s) => s.accessory)
                .filter((a): a is NonNullable<typeof a> => Boolean(a));
            expect(accessories).toHaveLength(0);
        });

        it('drops malformed button URLs (not parseable)', () => {
            const blocks = getChartCsvResultsBlocks({
                name: 'Chart',
                title: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'not-a-real-url',
                csvUrl: 'still-not-a-url',
            });

            const sections = findBlocks(blocks, 'section');
            sections.forEach((s) => {
                if (s.accessory && s.accessory.type === 'button') {
                    throw new Error(
                        'malformed ctaUrl should not produce a button accessory',
                    );
                }
            });

            const buttons = blocks.flatMap((b) =>
                b.type === 'actions' ? b.elements : [],
            );
            expect(buttons).toHaveLength(0);
        });
    });

    describe('warning messages replace dropped content', () => {
        it('shows a download-unavailable warning when csvUrl is too long', () => {
            const longCsvUrl = `https://s3.example.com/${'a'.repeat(
                SLACK_MAX_URL + 100,
            )}`;

            const blocks = getChartCsvResultsBlocks({
                name: 'Big chart',
                title: 'Big chart',
                description: 'Big chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                csvUrl: longCsvUrl,
            });

            const sectionTexts = findBlocks(blocks, 'section')
                .map((s) => s.text?.text ?? '')
                .join('\n');
            expect(sectionTexts).toMatch(/download/i);
            expect(sectionTexts).toMatch(
                /unavailable|too long|open in lightdash/i,
            );
        });

        it('shows a preview-unavailable warning when imageUrl is invalid', () => {
            const blocks = getChartAndDashboardBlocks({
                title: 'Chart',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                imageUrl: 'not-a-url',
            });

            const sectionTexts = findBlocks(blocks, 'section')
                .map((s) => s.text?.text ?? '')
                .join('\n');
            expect(sectionTexts).toMatch(/preview|chart image/i);
            expect(sectionTexts).toMatch(/unavailable|open in lightdash/i);
        });

        it('marks per-chart dashboard rows whose download URL is invalid', () => {
            const csvUrls = [
                {
                    filename: 'good.csv',
                    path: 'https://s3.example.com/good.csv',
                    localPath: '/tmp/good.csv',
                    truncated: false,
                },
                {
                    filename: 'bad.csv',
                    path: `https://s3.example.com/${'a'.repeat(
                        SLACK_MAX_URL + 100,
                    )}`,
                    localPath: '/tmp/bad.csv',
                    truncated: false,
                },
            ];

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Dashboard',
                name: 'Dashboard',
                description: 'desc',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
            });

            const sectionsWithBadFilename = findBlocks(
                blocks,
                'section',
            ).filter((s) => s.text?.text?.includes('bad.csv'));
            expect(sectionsWithBadFilename.length).toBeGreaterThanOrEqual(1);
            const text = sectionsWithBadFilename
                .map((s) => s.text?.text ?? '')
                .join('\n');
            expect(text).toMatch(/unavailable|warning/i);

            // Bad row should not still have a download button.
            sectionsWithBadFilename.forEach((s) => {
                expect(
                    s.accessory && s.accessory.type === 'button'
                        ? s.accessory.action_id
                        : 'no-button',
                ).not.toMatch(/^download-results-/);
            });
        });
    });

    describe('image URL validation', () => {
        it('drops the image block when image_url exceeds 3000 chars', () => {
            const longImage = `https://s3.example.com/${'a'.repeat(
                SLACK_MAX_URL + 100,
            )}`;

            const blocks = getChartAndDashboardBlocks({
                title: 'Chart',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                imageUrl: longImage,
            });

            expect(findBlocks(blocks, 'image')).toHaveLength(0);
        });

        it('keeps the image block when image_url is well-formed and short', () => {
            const blocks = getChartAndDashboardBlocks({
                title: 'Chart',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                imageUrl: 'https://s3.example.com/img.png',
            });

            expect(findBlocks(blocks, 'image')).toHaveLength(1);
        });
    });

    describe('header sanitisation', () => {
        it('omits the header block when title is empty', () => {
            const blocks = getChartAndDashboardBlocks({
                title: '',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
            });

            expect(findBlocks(blocks, 'header')).toHaveLength(0);
        });

        it('omits the header block when title is only whitespace', () => {
            const blocks = getChartCsvResultsBlocks({
                name: 'Chart',
                title: '   \n  ',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                csvUrl: 'https://s3.example.com/x.csv',
            });

            expect(findBlocks(blocks, 'header')).toHaveLength(0);
        });

        it('keeps the header block when title is non-empty', () => {
            const blocks = getChartAndDashboardBlocks({
                title: 'Real title',
                name: 'Chart',
                description: 'Chart desc',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
            });

            const headers = findBlocks(blocks, 'header');
            expect(headers).toHaveLength(1);
            expect(headers[0].text.text).toBe('Real title');
        });
    });

    describe('regression — typical inputs', () => {
        it('chart-and-dashboard blocks contain header, fields, image, footer', () => {
            const blocks = getChartAndDashboardBlocks({
                title: 'My chart',
                name: 'My chart',
                description: 'A description',
                message: 'Custom message',
                imageUrl: 'https://s3.example.com/img.png',
                ctaUrl: 'https://app.lightdash.com/chart/abc',
                footerMarkdown: 'sent by scheduler',
            });
            expect(findBlocks(blocks, 'header')).toHaveLength(1);
            expect(findBlocks(blocks, 'image')).toHaveLength(1);
            expect(findBlocks(blocks, 'context')).toHaveLength(1);
        });

        it('dashboard-csv with partial failures still emits a failure block', () => {
            const csvUrls = Array.from({ length: 2 }, (_, i) => ({
                filename: `chart-${i}.csv`,
                path: `https://s3.example.com/exports/chart-${i}.csv`,
                localPath: `/tmp/chart-${i}.csv`,
                truncated: false,
            }));
            const failures: PartialFailure[] = [
                {
                    type: PartialFailureType.DASHBOARD_CHART,
                    chartName: 'Failing chart',
                    error: 'Query timed out',
                    chartUuid: 'chart-uuid',
                    tileUuid: 'tile-uuid',
                },
            ];

            const blocks = getDashboardCsvResultsBlocks({
                title: 'Dashboard',
                name: 'Dashboard',
                description: 'desc',
                ctaUrl: 'https://app.lightdash.com/dashboard/abc',
                csvUrls,
                failures,
            });

            const sections = findBlocks(blocks, 'section');
            const failureSection = sections.find((s) =>
                s.text?.text?.includes('Failing chart'),
            );
            expect(failureSection).toBeDefined();
        });
    });
});
