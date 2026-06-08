import {
    extractPreviewProjectUuidFromUrl,
    extractPreviewUrlFromComments,
} from './gitIntegration';

const SITE_URL = 'https://app.lightdash.cloud';
const PREVIEW_UUID = '3c9a1b2d-4e5f-6071-8293-a4b5c6d7e8f9';
const PREVIEW_URL = `${SITE_URL}/projects/${PREVIEW_UUID}/tables`;

describe('extractPreviewUrlFromComments', () => {
    it('returns null when there are no comments', () => {
        expect(extractPreviewUrlFromComments([], SITE_URL)).toBeNull();
    });

    it('returns null when no comment contains a preview URL', () => {
        expect(
            extractPreviewUrlFromComments(
                ['Looks good to me', 'Please add a test'],
                SITE_URL,
            ),
        ).toBeNull();
    });

    it('extracts a bare preview URL', () => {
        expect(
            extractPreviewUrlFromComments(
                [`Preview environment ready: ${PREVIEW_URL}`],
                SITE_URL,
            ),
        ).toBe(PREVIEW_URL);
    });

    it('extracts a preview URL from a markdown link without trailing punctuation', () => {
        expect(
            extractPreviewUrlFromComments(
                [`Your [preview](${PREVIEW_URL}) is ready.`],
                SITE_URL,
            ),
        ).toBe(PREVIEW_URL);
    });

    it('ignores project URLs on other hosts', () => {
        expect(
            extractPreviewUrlFromComments(
                [
                    `https://github.com/lightdash/jaffle/pull/29`,
                    `https://evil.example.com/projects/${PREVIEW_UUID}/tables`,
                ],
                SITE_URL,
            ),
        ).toBeNull();
    });

    it('returns the most recently posted preview URL', () => {
        const newerUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const newerUrl = `${SITE_URL}/projects/${newerUuid}/tables`;
        expect(
            extractPreviewUrlFromComments(
                [
                    `Preview ready: ${PREVIEW_URL}`,
                    `Preview updated: ${newerUrl}`,
                ],
                SITE_URL,
            ),
        ).toBe(newerUrl);
    });

    it('matches the project root when there is no trailing path', () => {
        const rootUrl = `${SITE_URL}/projects/${PREVIEW_UUID}`;
        expect(
            extractPreviewUrlFromComments([`Preview: ${rootUrl}`], SITE_URL),
        ).toBe(rootUrl);
    });

    it('returns null for an invalid site URL', () => {
        expect(
            extractPreviewUrlFromComments(
                [`Preview: ${PREVIEW_URL}`],
                'not a url',
            ),
        ).toBeNull();
    });
});

describe('extractPreviewProjectUuidFromUrl', () => {
    it('extracts the preview project UUID from a Lightdash project URL', () => {
        expect(extractPreviewProjectUuidFromUrl(PREVIEW_URL, SITE_URL)).toEqual(
            PREVIEW_UUID,
        );
    });

    it('matches the project root URL', () => {
        expect(
            extractPreviewProjectUuidFromUrl(
                `${SITE_URL}/projects/${PREVIEW_UUID}`,
                SITE_URL,
            ),
        ).toEqual(PREVIEW_UUID);
    });

    it('rejects URLs from another host', () => {
        expect(
            extractPreviewProjectUuidFromUrl(
                `https://evil.example.com/projects/${PREVIEW_UUID}/tables`,
                SITE_URL,
            ),
        ).toBeNull();
    });
});
