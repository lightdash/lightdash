import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppExternalConnections } from '../../externalConnections/hooks/useAppExternalConnections';
import { useLinkAppExternalConnection } from '../../externalConnections/hooks/useLinkAppExternalConnection';
import { useUnlinkAppExternalConnection } from '../../externalConnections/hooks/useUnlinkAppExternalConnection';
import ChartTypeConnectionsButton from './ChartTypeConnectionsButton';

vi.mock('../../externalConnections/hooks/useAppExternalConnections', () => ({
    useAppExternalConnections: vi.fn(),
}));
vi.mock('../../externalConnections/hooks/useLinkAppExternalConnection', () => ({
    useLinkAppExternalConnection: vi.fn(),
}));
vi.mock(
    '../../externalConnections/hooks/useUnlinkAppExternalConnection',
    () => ({
        useUnlinkAppExternalConnection: vi.fn(),
    }),
);

const mockedLinks = vi.mocked(useAppExternalConnections);
const mockedLink = vi.mocked(useLinkAppExternalConnection);
const mockedUnlink = vi.mocked(useUnlinkAppExternalConnection);

const linked = {
    alias: 'ad_images',
    connection: {
        externalConnectionUuid: 'conn-1',
        name: 'Ad images',
        origin: 'https://cdn.example.com',
        allowBrowserImages: true,
    },
};

describe('ChartTypeConnectionsButton', () => {
    const unlink = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockedLink.mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useLinkAppExternalConnection>);
        mockedUnlink.mockReturnValue({
            mutate: unlink,
            isLoading: false,
        } as unknown as ReturnType<typeof useUnlinkAppExternalConnection>);
    });

    it('labels an unlinked chart type as Connections', () => {
        mockedLinks.mockReturnValue({
            data: [],
        } as unknown as ReturnType<typeof useAppExternalConnections>);

        renderWithProviders(
            <ChartTypeConnectionsButton
                projectUuid="project-1"
                appUuid="viz-1"
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Manage external connections' }),
        ).toHaveTextContent('Connections');
    });

    it('shows how many connections are linked', () => {
        mockedLinks.mockReturnValue({
            data: [linked],
        } as unknown as ReturnType<typeof useAppExternalConnections>);

        renderWithProviders(
            <ChartTypeConnectionsButton
                projectUuid="project-1"
                appUuid="viz-1"
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Manage external connections' }),
        ).toHaveTextContent('1 connection');
    });

    it('unlinks a connection from the list', async () => {
        mockedLinks.mockReturnValue({
            data: [linked],
        } as unknown as ReturnType<typeof useAppExternalConnections>);

        renderWithProviders(
            <ChartTypeConnectionsButton
                projectUuid="project-1"
                appUuid="viz-1"
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Manage external connections' }),
        );

        expect(screen.getByText('Ad images')).toBeInTheDocument();
        expect(screen.getByText(/cdn\.example\.com/)).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText('Unlink Ad images'));

        expect(unlink).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            appUuid: 'viz-1',
            alias: 'ad_images',
        });
    });
});
