import { type AppVersionStatus } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';

type IframePreviewProps = { src: string; previewToken: string };

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    searchParams: new URLSearchParams(),
    // The app's versions as the server holds them, keyed by version number.
    versions: {} as Record<number, string>,
}));

vi.mock('react-router', () => ({
    Navigate: () => null,
    useParams: () => ({ projectUuid: 'project-uuid', appUuid: 'app-uuid' }),
    useSearchParams: () => [mocks.searchParams, vi.fn()],
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));

vi.mock('../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));

vi.mock('../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: true },
    }),
}));

// Stands in for the server: the app read pages versions newest first and 404s
// when nothing matches, and a preview token is minted for whatever is asked.
vi.mock('../api');

import { mockedLightdashApi } from '../testing/mockedLightdashApi';
// eslint-disable-next-line import/first
import MinimalApp from './MinimalApp';

mockedLightdashApi.mockImplementation(async ({ url }: { url: string }) => {
    const { pathname, searchParams } = new URL(url, 'http://server');
    const tokenMatch = pathname.match(/\/versions\/(\d+)\/preview-token$/);
    if (tokenMatch) return { token: `token-v${tokenMatch[1]}` };

    const beforeVersion = searchParams.get('beforeVersion');
    const limit = Number(searchParams.get('limit'));
    const all = Object.entries(mocks.versions)
        .map(([version, status]) => ({ version: Number(version), status }))
        .sort((a, b) => b.version - a.version);
    const matching = all.filter(
        (v) => beforeVersion === null || v.version < Number(beforeVersion),
    );
    if (beforeVersion !== null && matching.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw {
            status: 'error',
            error: {
                statusCode: 404,
                name: 'NotFoundError',
                message: 'App not found',
                data: {},
            },
        };
    }
    return {
        appUuid: 'app-uuid',
        versions: matching.slice(0, limit),
        hasMore: matching.length > limit,
        latestReadyVersion:
            all.find((v) => v.status === 'ready')?.version ?? null,
    };
});

const setVersions = (versions: Record<number, AppVersionStatus>) => {
    mocks.versions = versions;
};

const renderedPreview = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const expectVersionRendered = async (version: number) => {
    await waitFor(() => {
        expect(mocks.iframePreview).toHaveBeenCalled();
    });
    expect(renderedPreview().src).toContain(
        `/api/apps/app-uuid/versions/${version}/t/token-v${version}/`,
    );
    expect(renderedPreview().previewToken).toBe(`token-v${version}`);
};

const expectEmptyState = async () => {
    expect(await screen.findByText('No ready version')).toBeInTheDocument();
    expect(mocks.iframePreview).not.toHaveBeenCalled();
};

describe('MinimalApp version', () => {
    beforeEach(() => {
        mocks.iframePreview.mockClear();
        mocks.searchParams = new URLSearchParams();
        setVersions({});
    });

    it('renders the latest ready version when no version is given', async () => {
        setVersions({ 1: 'ready', 2: 'ready', 3: 'error' });
        renderWithProviders(<MinimalApp />);

        await expectVersionRendered(2);
    });

    it('renders the requested version even when a newer ready version exists', async () => {
        setVersions({ 1: 'ready', 2: 'ready', 3: 'ready' });
        mocks.searchParams.set('version', '1');
        renderWithProviders(<MinimalApp />);

        await expectVersionRendered(1);
    });

    it('renders a requested version older than the first page of versions', async () => {
        setVersions({
            1: 'ready',
            2: 'ready',
            3: 'ready',
            4: 'ready',
            5: 'ready',
            6: 'ready',
            7: 'ready',
            8: 'ready',
        });
        mocks.searchParams.set('version', '2');
        renderWithProviders(<MinimalApp />);

        await expectVersionRendered(2);
    });

    it('shows the empty state for a requested version that failed, without falling back', async () => {
        setVersions({ 1: 'ready', 2: 'error', 3: 'ready' });
        mocks.searchParams.set('version', '2');
        renderWithProviders(<MinimalApp />);

        await expectEmptyState();
    });

    it('shows the empty state for a requested version that is still building', async () => {
        setVersions({ 1: 'ready', 2: 'building' });
        mocks.searchParams.set('version', '2');
        renderWithProviders(<MinimalApp />);

        await expectEmptyState();
    });

    it('shows the empty state for a requested version that does not exist', async () => {
        setVersions({ 1: 'ready', 2: 'ready' });
        mocks.searchParams.set('version', '7');
        renderWithProviders(<MinimalApp />);

        await expectEmptyState();
    });

    it.each(['0', '-1', '1.5', 'latest', ''])(
        'shows the empty state for the malformed version "%s"',
        async (version) => {
            setVersions({ 1: 'ready' });
            mocks.searchParams.set('version', version);
            renderWithProviders(<MinimalApp />);

            await expectEmptyState();
        },
    );
});
