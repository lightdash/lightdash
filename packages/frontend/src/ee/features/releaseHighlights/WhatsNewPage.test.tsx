import {
    LightdashMode,
    type HealthState,
    type ReleaseHighlightsResult,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from '../../../components/upgradeNoticeLinks';
import { renderWithProviders } from '../../../testing/testUtils';
import { WhatsNewContent } from './WhatsNewContent';
import WhatsNewPage from './WhatsNewPage';

const mocks = vi.hoisted(() => ({
    ambientAiEnabled: vi.fn(() => true),
    highlightsHook: vi.fn(),
    query: {
        data: undefined as ReleaseHighlightsResult | undefined,
        isInitialLoading: false,
        isError: false,
    },
}));
vi.mock('../ambientAi/hooks/useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: mocks.ambientAiEnabled,
}));
vi.mock('./useReleaseHighlights', () => ({
    useReleaseHighlights: mocks.highlightsHook,
}));
vi.mock('../../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({ activeProjectUuid: undefined }),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('../../../hooks/user/useImpersonation', () => ({
    useImpersonation: () => ({ isImpersonating: false }),
}));

beforeEach(() => {
    mocks.ambientAiEnabled.mockReset().mockReturnValue(true);
    mocks.highlightsHook.mockReset().mockImplementation(() => mocks.query);
    mocks.query.data = undefined;
    mocks.query.isInitialLoading = false;
    mocks.query.isError = false;
});
const behindHealth: Partial<HealthState> = {
    mode: LightdashMode.DEFAULT,
    version: '2.500.0',
    latest: { version: '2.580.0' },
};
const renderPage = async (health: Partial<HealthState> = behindHealth) => {
    const result = renderWithProviders(
        <MemoryRouter>
            <WhatsNewPage />
        </MemoryRouter>,
        { health },
    );
    await screen.findByRole('heading', { level: 2 });
    return result;
};
const readyHighlights: ReleaseHighlightsResult = {
    status: 'ready',
    fromVersion: '2.500.0',
    toVersion: '2.580.0',
    generatedAt: new Date(),
    highlights: [
        {
            title: 'Chart options',
            benefit: 'Answer more questions',
            url: 'https://github.com/lightdash/lightdash/pull/31000',
            version: '2.580.0',
            requestedByYourOrganization: false,
        },
        {
            title: 'Chart sharing',
            benefit: '<b>Share with your team</b>',
            url: 'https://github.com/lightdash/lightdash/releases/tag/2.579.0',
            version: '2.579.0',
            requestedByYourOrganization: true,
        },
    ],
};
const summaryNote =
    'Summarised by your configured AI model from public release notes. Check the full changelog for fixes and breaking changes.';

describe('WhatsNewPage', () => {
    it('reserves three card rows with skeletons while loading and keeps the actions', async () => {
        mocks.query.isInitialLoading = true;
        const { container } = await renderPage();
        expect(
            screen.getByLabelText('Loading release highlights').children,
        ).toHaveLength(3);
        expect(
            container.querySelectorAll('[data-visible="true"]'),
        ).toHaveLength(3);
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /How to update/ }),
        ).toBeInTheDocument();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: true,
        });
    });

    it('puts requested cards first and the AI note above the other highlights', async () => {
        mocks.query.data = readyHighlights;
        await renderPage();
        expect(
            screen.getByText("You're on v2.500.0 · latest is v2.580.0"),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', {
                name: "What's new since v2.500.0",
                level: 2,
            }),
        ).toBeInTheDocument();
        const requestedSection = screen.getByRole('heading', {
            name: 'Requested by your organization',
        }).parentElement!;
        expect(
            within(requestedSection).getByText('Chart sharing'),
        ).toBeInTheDocument();
        const requestedBadge = within(requestedSection)
            .getByText('Requested')
            .closest('.mantine-Badge-root')!;
        expect(requestedBadge).toHaveAttribute('data-variant', 'light');
        expect(requestedBadge).toHaveStyle({
            '--badge-color': 'var(--mantine-color-green-light-color)',
        });
        const highlightsSection = screen.getByRole('heading', {
            name: 'Highlights',
        }).parentElement!.parentElement!.parentElement!;
        expect(
            within(highlightsSection)
                .getByText('AI summary')
                .closest('.mantine-Badge-root')!,
        ).toHaveAttribute('data-variant', 'light');
        const note = within(highlightsSection).getByText(summaryNote);
        const title = within(highlightsSection).getByText('Chart options');
        expect(
            note.compareDocumentPosition(title) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.getByText('Chart sharing').compareDocumentPosition(title) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen.queryByRole('link', { name: 'Chart options' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText('<b>Share with your team</b>').querySelector('b'),
        ).toBeNull();
        expect(screen.getByText('Added in v2.579.0')).toBeInTheDocument();
        expect(screen.getByText('Added in v2.580.0')).toBeInTheDocument();
    });

    it('labels source links by URL and makes every new-tab link accessible', async () => {
        mocks.query.data = readyHighlights;
        await renderPage();
        expect(
            screen.getByRole('link', { name: /View pull request/ }),
        ).toHaveAttribute('href', readyHighlights.highlights[0].url);
        expect(
            screen.getByRole('link', { name: /View release/ }),
        ).toHaveAttribute('href', readyHighlights.highlights[1].url);
        const links = screen.getAllByRole('link');
        expect(links[0]).toHaveAttribute('href', UPDATE_LIGHTDASH_DOCS_URL);
        expect(links[1]).toHaveAttribute(
            'href',
            'https://github.com/lightdash/lightdash/compare/2.500.0...2.580.0',
        );
        expect(links[2]).toHaveAttribute('href', RELEASE_NOTES_URL);
        links.forEach((link) => {
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noreferrer');
            const hint = within(link).getByText('(opens in a new tab)');
            expect(hint).toHaveClass('mantine-VisuallyHidden-root');
            expect(link.querySelector('svg')).not.toBeNull();
        });
    });

    it('offers an AI setting hint without highlights when AI is disabled', async () => {
        mocks.ambientAiEnabled.mockReturnValue(false);
        mocks.query.data = readyHighlights;
        mocks.query.isInitialLoading = true;
        await renderPage();
        expect(
            screen.getByText(
                'Turn on AI to see a summary of new features here.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Highlights' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', {
                name: 'Requested by your organization',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('Loading release highlights'),
        ).not.toBeInTheDocument();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: false,
        });
    });

    it.each(['generation_failed', 'rate_limited'] as const)(
        'shows a temporary availability hint for %s',
        async (reason) => {
            mocks.query.data = { status: 'unavailable', reason };
            await renderPage();
            expect(
                screen.getByText("Highlights aren't available right now."),
            ).toBeInTheDocument();
            expect(screen.getAllByRole('link')).toHaveLength(3);
        },
    );

    it.each([
        'not_self_hosted',
        'update_check_disabled',
        'up_to_date',
        'ai_not_configured',
        'source_unavailable',
        'no_features',
    ] as const)('shows the empty-range hint for %s', async (reason) => {
        mocks.query.data = { status: 'unavailable', reason };
        await renderPage();
        expect(
            screen.getByText('No feature highlights for this range.'),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('link')).toHaveLength(3);
    });

    it.each(['error', 'empty'])(
        'shows the empty-range hint for %s results',
        async (state) => {
            mocks.query.isError = state === 'error';
            mocks.query.data = { ...readyHighlights, highlights: [] };
            await renderPage();
            expect(
                screen.getByText('No feature highlights for this range.'),
            ).toBeInTheDocument();
            expect(screen.queryByText(summaryNote)).not.toBeInTheDocument();
        },
    );

    it.each([
        { ...behindHealth, latest: { version: '2.500.0' } },
        { ...behindHealth, mode: LightdashMode.CLOUD_BETA },
    ])(
        'shows only release notes when no self-hosted update applies: %j',
        async (health) => {
            mocks.query.data = readyHighlights;
            await renderPage(health);
            expect(
                screen.getByRole('heading', {
                    name: "You're on the latest version",
                }),
            ).toBeInTheDocument();
            expect(screen.getAllByRole('link')).toHaveLength(1);
            expect(
                screen.getByRole('link', { name: /Release notes/ }),
            ).toHaveAttribute('href', RELEASE_NOTES_URL);
            expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
                enabled: false,
            });
            expect(screen.queryByText(summaryNote)).not.toBeInTheDocument();
        },
    );
});

const renderDrawerContent = async () => {
    const result = renderWithProviders(<WhatsNewContent layout="drawer" />, {
        health: behindHealth,
    });
    await screen.findByRole('heading', { level: 4 });
    return result;
};

describe('WhatsNewContent drawer layout', () => {
    it('uses a compact heading and links to the full page with a new-tab hint', async () => {
        await renderDrawerContent();
        expect(
            screen.getByRole('heading', {
                level: 4,
                name: "What's new since v2.500.0",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("You're on v2.500.0 · latest is v2.580.0"),
        ).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /Open full page/ });
        expect(link).toHaveAttribute('href', '/whats-new');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
        expect(within(link).getByText('(opens in a new tab)')).toHaveClass(
            'mantine-VisuallyHidden-root',
        );
        expect(link.querySelector('svg')).not.toBeNull();
    });

    it('keeps requested and AI badges, versions and source links', async () => {
        mocks.query.data = readyHighlights;
        await renderDrawerContent();
        expect(
            screen.getByRole('heading', {
                name: 'Requested by your organization',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Requested').closest('.mantine-Badge-root'),
        ).toHaveStyle({
            '--badge-color': 'var(--mantine-color-green-light-color)',
        });
        expect(
            screen.getByText('AI summary').closest('.mantine-Badge-root'),
        ).toHaveStyle({
            '--badge-color': 'var(--mantine-color-indigo-light-color)',
        });
        expect(screen.getByText(summaryNote)).toBeInTheDocument();
        expect(screen.getByText('Added in v2.579.0')).toBeInTheDocument();
        expect(screen.getByText('Added in v2.580.0')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /View pull request/ }),
        ).toHaveAttribute('href', readyHighlights.highlights[0].url);
        expect(
            screen.getByRole('link', { name: /View release/ }),
        ).toHaveAttribute('href', readyHighlights.highlights[1].url);
    });

    it('keeps the actions while loading three skeleton cards', async () => {
        mocks.query.isInitialLoading = true;
        await renderDrawerContent();
        expect(
            screen.getByLabelText('Loading release highlights').children,
        ).toHaveLength(3);
        expect(screen.getAllByRole('link')).toHaveLength(4);
    });

    it('shows the AI setting hint with update actions when AI is disabled', async () => {
        mocks.ambientAiEnabled.mockReturnValue(false);
        mocks.query.data = readyHighlights;
        await renderDrawerContent();
        expect(
            screen.getByText(
                'Turn on AI to see a summary of new features here.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('AI summary')).not.toBeInTheDocument();
        expect(screen.queryByText('Requested')).not.toBeInTheDocument();
        expect(screen.getAllByRole('link')).toHaveLength(4);
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: false,
        });
    });

    it.each(['unavailable', 'empty', 'error'] as const)(
        'keeps the actions for %s results',
        async (state) => {
            mocks.query.isError = state === 'error';
            mocks.query.data =
                state === 'unavailable'
                    ? { status: 'unavailable', reason: 'generation_failed' }
                    : { ...readyHighlights, highlights: [] };
            await renderDrawerContent();
            expect(
                screen.getByText(
                    state === 'unavailable'
                        ? "Highlights aren't available right now."
                        : 'No feature highlights for this range.',
                ),
            ).toBeInTheDocument();
            expect(screen.getAllByRole('link')).toHaveLength(4);
        },
    );
});
