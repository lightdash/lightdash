import { APP_UPGRADE_PROMPT_LABEL } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../../apps/testing/appVersionHistory';
import { buildStub } from '../testing/dataAppVizBuildStub';
import VersionHistoryPanel from './VersionHistoryPanel';

const styles = readFileSync(
    join(
        process.cwd(),
        'src/features/chartTypes/builder/VersionHistoryPanel.module.css',
    ),
    'utf8',
);

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
    onClose: vi.fn(),
    build: buildStub(),
    hasEarlier: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
};

const twoVersions = [
    appVersion({ version: 2, prompt: 'add a legend' }),
    appVersion({ version: 1, prompt: 'first' }),
];

describe('VersionHistoryPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists versions newest first with their prompts', () => {
        renderWithProviders(
            <VersionHistoryPanel {...defaultProps} versions={twoVersions} />,
        );

        const labels = screen.getAllByText(/^v\d+$/);
        expect(labels.map((l) => l.textContent)).toEqual(['v2', 'v1']);
        expect(screen.getByText('add a legend')).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('pins an older version on click and unpins from the current one', () => {
        const onView = vi.fn();
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={twoVersions}
                onView={onView}
            />,
        );

        fireEvent.click(screen.getByLabelText('View v1'));
        expect(onView).toHaveBeenCalledWith(1);

        fireEvent.click(screen.getByLabelText('View v2'));
        expect(onView).toHaveBeenCalledWith(null);
    });

    it('marks the viewed version and restores it from its own entry', () => {
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={twoVersions}
                viewedVersion={1}
            />,
        );

        expect(screen.getByText('Viewing')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Restore'));
        expect(screen.getByTestId('restore-modal')).toHaveTextContent(
            'restore-1',
        );
    });

    it('shows an in-progress history version as building', () => {
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={[
                    appVersion({ version: 3, status: 'generating' }),
                    ...twoVersions,
                ]}
            />,
        );

        expect(screen.getByText('Building…')).toBeInTheDocument();
    });

    it('does not pulse an in-progress version', () => {
        expect(styles).not.toMatch(/@keyframes\s+ldPulse/);
        expect(styles).not.toMatch(/animation:\s*ldPulse/);
    });

    it('uses the theme-aware neutral selection surface', () => {
        const activeEntryStyles = styles.match(
            /\.entry\[data-active='true'\]\s*\{([^}]*)\}/s,
        )?.[1];

        expect(activeEntryStyles).toContain('var(--mantine-color-ldGray-1)');
        expect(activeEntryStyles).toContain('var(--mantine-color-dark-5)');
        expect(styles).not.toContain('ldBrandViolet');
    });

    it('writes a live entry for a build not yet in history', () => {
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={twoVersions}
                build={buildStub({
                    isBuilding: true,
                    claimedVersion: 3,
                    pendingPrompt: 'make it teal',
                })}
            />,
        );

        expect(screen.getByText('v3')).toBeInTheDocument();
        expect(screen.getByText('make it teal')).toBeInTheDocument();
    });

    it('explains a failed version and offers no preview of it', () => {
        const onView = vi.fn();
        renderWithProviders(
            <VersionHistoryPanel
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

        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('Sandbox crashed')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('View v3'));
        expect(onView).not.toHaveBeenCalled();
    });

    it.each(['ready', 'error'] as const)(
        'reveals recorded build details for a %s version',
        async (status) => {
            renderWithProviders(
                <VersionHistoryPanel
                    {...defaultProps}
                    versions={[
                        appVersion({
                            version: 3,
                            status,
                            statusHistory: [
                                {
                                    kind: 'thinking',
                                    message: 'Choosing a horizontal layout',
                                    timestamp: '2026-05-15T10:00:10Z',
                                },
                                {
                                    kind: 'tool',
                                    message: 'Updating Chart.tsx',
                                    timestamp: '2026-05-15T10:00:20Z',
                                },
                            ],
                        }),
                        ...twoVersions,
                    ]}
                />,
            );

            expect(
                screen.queryByText('Choosing a horizontal layout'),
            ).not.toBeInTheDocument();

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Build details for v3',
                }),
            );

            expect(
                screen.getAllByText('Choosing a horizontal layout').length,
            ).toBeGreaterThan(0);
            expect(
                screen.getAllByText('Updating Chart.tsx').length,
            ).toBeGreaterThan(0);
        },
    );

    it('leaves versions without a recorded trace unchanged', () => {
        renderWithProviders(
            <VersionHistoryPanel {...defaultProps} versions={twoVersions} />,
        );

        expect(screen.queryByText('Build details')).not.toBeInTheDocument();
    });

    it('shows the durable summary for a completed SDK upgrade', () => {
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={[
                    appVersion({
                        version: 3,
                        prompt: APP_UPGRADE_PROMPT_LABEL,
                        statusMessage:
                            'Upgraded to the latest chart SDK.\n\nNewly available — ask me to add this in the prompt bar:\n\n- **Metric filters** — Filter grouped results.',
                    }),
                    ...twoVersions,
                ]}
                latestReadyVersion={3}
            />,
        );

        expect(screen.getByText('Upgrade summary')).toBeInTheDocument();
        expect(screen.getByText('Metric filters')).toBeInTheDocument();
        expect(
            screen.getByText(/ask me to add this in the prompt bar/i),
        ).toBeInTheDocument();
    });

    it('loads earlier versions on demand', () => {
        const fetchEarlier = vi.fn();
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={twoVersions}
                hasEarlier
                fetchEarlier={fetchEarlier}
            />,
        );

        fireEvent.click(screen.getByText('Load earlier versions'));
        expect(fetchEarlier).toHaveBeenCalledTimes(1);
    });

    it('closes from its own header', () => {
        const onClose = vi.fn();
        renderWithProviders(
            <VersionHistoryPanel
                {...defaultProps}
                versions={twoVersions}
                onClose={onClose}
            />,
        );

        fireEvent.click(screen.getByLabelText('Close history'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
