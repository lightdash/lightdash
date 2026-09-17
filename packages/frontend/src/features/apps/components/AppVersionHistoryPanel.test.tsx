import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../testing/appVersionHistory';
import AppVersionHistoryPanel from './AppVersionHistoryPanel';

const entry = (
    version: number,
    threadNumber: number,
    prompt = `prompt ${version}`,
): ApiAppVersionSummary => ({
    ...appVersion({ version, prompt }),
    threadUuid: `thread-${threadNumber}`,
    threadNumber,
});

const defaultProps = {
    latestReadyVersion: 3 as number | null,
    viewedVersion: null as number | null,
    onView: vi.fn(),
    onRestore: vi.fn(),
    onClose: null,
    onBack: null,
    liveBuild: null,
    hasEarlier: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
    emptyPromptLabel: null,
    olderVersionTime: 'relative' as const,
    currentThreadNumber: null as number | null,
};

describe('AppVersionHistoryPanel', () => {
    it('separates thread groups with a divider, newest thread first', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(1, 1), entry(3, 2), entry(2, 1)]}
            />,
        );

        const labels = screen.getAllByText(/^v\d+$/);
        expect(labels.map((l) => l.textContent)).toEqual(['v3', 'v2', 'v1']);
        expect(screen.getAllByText('Agent context cleared')).toHaveLength(1);
    });

    it('tops the list with a divider when the current thread has no versions yet', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(2, 1), entry(1, 1)]}
                currentThreadNumber={2}
            />,
        );

        const list = screen.getByLabelText('Version history');
        const divider = screen.getByText('Agent context cleared');
        const firstVersion = screen.getByText('v2');
        expect(
            divider.compareDocumentPosition(firstVersion) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(list).toContainElement(divider);
    });

    it('renders no divider for a single thread', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(3, 1), entry(2, 1), entry(1, 1)]}
                currentThreadNumber={1}
            />,
        );

        expect(
            screen.queryByText('Agent context cleared'),
        ).not.toBeInTheDocument();
    });

    it('renders an empty prompt empty when no stand-in label is given', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(3, 1, ''), entry(2, 1)]}
            />,
        );

        expect(screen.getByText('prompt 2')).toBeInTheDocument();
        expect(
            screen.queryByText('Uploaded from source'),
        ).not.toBeInTheDocument();
    });

    it('offers Preview and Restore only on ready versions', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[
                    entry(3, 1),
                    { ...entry(2, 1), status: 'error' },
                    entry(1, 1),
                ]}
            />,
        );

        expect(screen.getAllByText('Preview')).toHaveLength(1);
        expect(screen.getAllByText('Restore')).toHaveLength(1);
    });

    it('shows an empty state with no versions', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[]}
                latestReadyVersion={null}
            />,
        );

        expect(screen.getByText('No versions yet')).toBeInTheDocument();
    });
});
