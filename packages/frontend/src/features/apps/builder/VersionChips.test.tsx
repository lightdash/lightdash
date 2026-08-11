import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../testing/appVersionHistory';
import { buildStub } from '../testing/dataAppVizBuildStub';
import VersionChips from './VersionChips';

vi.mock('./RestoreVersionModal', () => ({
    default: ({ version }: { version: number }) => (
        <div data-testid="restore-modal">{`restore-${version}`}</div>
    ),
}));

const defaultProps = {
    projectUuid: 'project-1',
    appUuid: 'app-1',
    latestReadyVersion: 2 as number | null,
    viewedVersion: null as number | null,
    onView: vi.fn(),
    build: buildStub(),
    hasEarlier: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
};

const twoVersions = [
    appVersion({ version: 2 }),
    appVersion({ version: 1, prompt: 'first' }),
];

describe('VersionChips', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists versions oldest to newest and marks the current one', () => {
        renderWithProviders(
            <VersionChips {...defaultProps} versions={twoVersions} />,
        );

        const chips = screen.getAllByText(/^v\d/);
        expect(chips.map((c) => c.textContent)).toEqual(['v1', 'v2 · current']);
    });

    it('pins an older version on click and unpins from the current chip', () => {
        const onView = vi.fn();
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={twoVersions}
                onView={onView}
            />,
        );

        fireEvent.click(screen.getByText('v1'));
        expect(onView).toHaveBeenCalledWith(1);

        fireEvent.click(screen.getByText('v2 · current'));
        expect(onView).toHaveBeenCalledWith(null);
    });

    it('offers restore and the way back while viewing an older version', () => {
        const onView = vi.fn();
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={twoVersions}
                viewedVersion={1}
                onView={onView}
            />,
        );

        expect(screen.getByText(/not the current version/)).toBeInTheDocument();

        fireEvent.click(screen.getByText('Back to v2'));
        expect(onView).toHaveBeenCalledWith(null);

        fireEvent.click(screen.getByText('Restore v1'));
        expect(screen.getByTestId('restore-modal')).toHaveTextContent(
            'restore-1',
        );
    });

    it('shows an in-progress history version as building', () => {
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={[
                    appVersion({ version: 3, status: 'generating' }),
                    ...twoVersions,
                ]}
            />,
        );

        expect(screen.getByText('v3 · building…')).toBeInTheDocument();
    });

    it('writes a live chip for a build not yet in history', () => {
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={twoVersions}
                build={buildStub({ isBuilding: true, claimedVersion: 3 })}
            />,
        );

        expect(screen.getByText('v3 · building…')).toBeInTheDocument();
    });

    it('marks a failed version and offers no preview of it', () => {
        const onView = vi.fn();
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={[
                    appVersion({
                        version: 3,
                        status: 'error',
                        statusMessage: 'Sandbox crashed',
                    }),
                    ...twoVersions,
                ]}
                onView={onView}
            />,
        );

        fireEvent.click(screen.getByText('v3 · failed'));
        expect(onView).not.toHaveBeenCalled();
    });

    it('loads earlier versions on demand', () => {
        const fetchEarlier = vi.fn();
        renderWithProviders(
            <VersionChips
                {...defaultProps}
                versions={twoVersions}
                hasEarlier
                fetchEarlier={fetchEarlier}
            />,
        );

        fireEvent.click(screen.getByText('…'));
        expect(fetchEarlier).toHaveBeenCalledTimes(1);
    });
});
