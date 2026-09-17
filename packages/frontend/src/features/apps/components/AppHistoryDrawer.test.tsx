import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../testing/appVersionHistory';
import AppHistoryDrawer from './AppHistoryDrawer';

const entry = (
    version: number,
    threadNumber: number,
    status: ApiAppVersionSummary['status'] = 'ready',
): ApiAppVersionSummary => ({
    ...appVersion({ version, prompt: `prompt ${version}`, status }),
    threadUuid: `thread-${threadNumber}`,
    threadNumber,
});

const baseProps = {
    opened: true,
    onClose: vi.fn(),
    latestReadyVersion: 3 as number | null,
    viewedVersion: null as number | null,
    onView: vi.fn(),
    onRestore: vi.fn(),
    liveBuild: null,
    hasEarlier: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
};

describe('AppHistoryDrawer', () => {
    it('closes from "Back to chat"', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <AppHistoryDrawer
                {...baseProps}
                onClose={onClose}
                versions={[entry(1, 1), entry(2, 1)]}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chat' }),
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('hands Preview and Restore to the host and offers neither on a failed version', async () => {
        const onView = vi.fn();
        const onRestore = vi.fn();
        renderWithProviders(
            <AppHistoryDrawer
                {...baseProps}
                onView={onView}
                onRestore={onRestore}
                versions={[entry(3, 1), entry(2, 1, 'error'), entry(1, 1)]}
            />,
        );

        expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(
            1,
        );
        expect(
            screen.getAllByRole('button', { name: 'Restore this version' }),
        ).toHaveLength(1);

        await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(onView).toHaveBeenCalledWith(1);

        await userEvent.click(
            screen.getByRole('button', { name: 'Restore this version' }),
        );
        expect(onRestore).toHaveBeenCalledWith(1);
    });

    it('renders nothing while closed', () => {
        renderWithProviders(
            <AppHistoryDrawer
                {...baseProps}
                opened={false}
                versions={[entry(1, 1)]}
            />,
        );

        expect(screen.queryByText('v1')).not.toBeInTheDocument();
    });
});
