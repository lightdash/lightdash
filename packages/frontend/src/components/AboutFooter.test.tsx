import {
    LightdashMode,
    type HealthState,
    type ReleaseHighlightsResult,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../testing/testUtils';
import AboutFooter from './AboutFooter';
import {
    getChangesSinceVersionUrl,
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from './upgradeNoticeLinks';

const mocks = vi.hoisted(() => ({
    ambientAiEnabled: vi.fn(() => true),
    highlightsHook: vi.fn(),
    query: {
        data: undefined as ReleaseHighlightsResult | undefined,
        isInitialLoading: false,
        isError: false,
    },
}));
vi.mock('../ee/features/ambientAi/hooks/useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: mocks.ambientAiEnabled,
}));
vi.mock('../ee/features/releaseHighlights/useReleaseHighlights', () => ({
    useReleaseHighlights: mocks.highlightsHook,
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
const renderFooter = (health: Partial<HealthState> = behindHealth) =>
    renderWithProviders(
        <MemoryRouter>
            <AboutFooter />
        </MemoryRouter>,
        { health },
    );
const openAboutModal = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /v2\.500\.0/ }));
    return screen.findByRole('dialog');
};
const readyHighlights = (requestedCount: number): ReleaseHighlightsResult => ({
    status: 'ready',
    fromVersion: '2.500.0',
    toVersion: '2.580.0',
    generatedAt: new Date(),
    highlights: Array.from({ length: 3 }, (_, index) => ({
        title: `Feature ${index}`,
        benefit: `Benefit ${index}`,
        url: `https://github.com/lightdash/lightdash/pull/${31000 + index}`,
        version: '2.580.0',
        requestedByYourOrganization: index < requestedCount,
    })),
});

describe('AboutFooter upgrade notice', () => {
    it('shows the footer and version badges with a quiet notice and update action first', async () => {
        renderFooter();
        const footerButton = await screen.findByRole('button', {
            name: /v2\.500\.0/,
        });
        expect(
            within(footerButton).getByText('Update available'),
        ).toBeInTheDocument();
        const dialog = await openAboutModal();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            within(dialog).getByRole('heading', {
                name: 'v2.580.0 is available',
            }),
        ).toBeInTheDocument();
        const badge = within(dialog)
            .getByText('Update available')
            .closest('.mantine-Badge-root')!;
        expect(badge).toHaveAttribute('data-variant', 'light');
        expect(badge.parentElement).toContainElement(
            within(dialog).getByText('v2.500.0'),
        );
        expect(
            within(dialog).getByText(
                'See what changed since v2.500.0 before you update.',
            ),
        ).toBeInTheDocument();
        const links = within(dialog).getAllByRole('link');
        expect(links.slice(0, 4).map((link) => link.textContent)).toEqual([
            'How to update (opens in a new tab)',
            "See what's new (opens in a new tab)",
            'Changes since v2.500.0 (opens in a new tab)',
            'Release notes (opens in a new tab)',
        ]);
        expect(links[0]).toHaveAttribute('href', UPDATE_LIGHTDASH_DOCS_URL);
        expect(links[1]).toHaveAttribute('href', '/whats-new');
        expect(links[2]).toHaveAttribute(
            'href',
            getChangesSinceVersionUrl('2.500.0', '2.580.0'),
        );
        expect(links[3]).toHaveAttribute('href', RELEASE_NOTES_URL);
        links.slice(0, 4).forEach((link) => {
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noreferrer');
            expect(
                within(link).getByText('(opens in a new tab)'),
            ).toBeInTheDocument();
            expect(link.querySelector('svg')).not.toBeNull();
        });
    });

    it.each([
        { ...behindHealth, latest: { version: '2.500.0' } },
        { ...behindHealth, mode: LightdashMode.CLOUD_BETA },
        { ...behindHealth, latest: { version: '' } },
    ])('omits the notice when no update applies: %j', async (health) => {
        renderFooter(health);
        await openAboutModal();
        expect(screen.queryByText('Update available')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Release notes/ }),
        ).not.toBeInTheDocument();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
    });

    it('requests highlights only after opening the modal with an update', async () => {
        renderFooter();
        await screen.findByRole('button', { name: /v2\.500\.0/ });
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
        await openAboutModal();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: true,
        });
    });

    it('hides the new page link and disables the query when ambient AI is disabled', async () => {
        mocks.ambientAiEnabled.mockReturnValue(false);
        mocks.query.data = readyHighlights(2);
        renderFooter();
        await openAboutModal();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: false,
        });
        expect(
            screen.queryByRole('link', { name: /See what's new/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'See what changed since v2.500.0 before you update.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /How to update/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Changes since/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Release notes/ }),
        ).toBeInTheDocument();
    });

    it.each([1, 2])(
        'shows the requested count with correct grammar for %i items',
        async (count) => {
            mocks.query.data = readyHighlights(count);
            renderFooter();
            await openAboutModal();
            expect(
                screen.getByText(
                    `Includes ${count} ${count === 1 ? 'feature' : 'features'} your organization requested.`,
                ),
            ).toBeInTheDocument();
            expect(screen.queryByText('Feature 0')).not.toBeInTheDocument();
            expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
        },
    );

    it.each(['loading', 'empty', 'unavailable', 'error'])(
        'keeps the default line without a loader for %s',
        async (state) => {
            mocks.query.isInitialLoading = state === 'loading';
            mocks.query.isError = state === 'error';
            mocks.query.data =
                state === 'unavailable'
                    ? { status: 'unavailable', reason: 'generation_failed' }
                    : state === 'empty'
                      ? readyHighlights(0)
                      : undefined;
            renderFooter();
            await openAboutModal();
            expect(
                screen.getByText(
                    'See what changed since v2.500.0 before you update.',
                ),
            ).toBeInTheDocument();
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
            expect(
                screen.queryByText('Finding release highlights…'),
            ).not.toBeInTheDocument();
        },
    );
});

describe('getChangesSinceVersionUrl', () => {
    it('builds a compare URL between release tags', () => {
        expect(getChangesSinceVersionUrl('2.1.0', '2.3.4')).toBe(
            'https://github.com/lightdash/lightdash/compare/2.1.0...2.3.4',
        );
    });
});
