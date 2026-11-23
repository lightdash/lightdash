import { ApiConnectorType, type Explore } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useLiveSourceUserSignIns } from '../hooks/useLiveSourceUserSignIns';
import { LiveSourceExploreBadge } from './LiveSourceExploreBadge';

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../hooks/useLiveSourceUserSignIns', () => ({
    useLiveSourceUserSignIns: vi.fn(),
}));

const explore = {
    name: 'hydra_events',
    apiSource: {
        connectionUuid: 'connection-1',
        integration: ApiConnectorType.HYDRA,
    },
} as unknown as Explore;

const withSignIns = (connectionUuids: string[]) =>
    vi.mocked(useLiveSourceUserSignIns).mockReturnValue({
        data: connectionUuids.map((externalConnectionUuid) => ({
            externalConnectionUuid,
            name: 'Hydra',
            connector: ApiConnectorType.HYDRA,
            isSignedIn: true,
            signedInAt: null,
        })),
    } as unknown as ReturnType<typeof useLiveSourceUserSignIns>);

describe('LiveSourceExploreBadge', () => {
    beforeEach(() => {
        vi.mocked(useLiveSourceUserSignIns).mockReset();
    });

    it('says the results are shown with your own access on a per-viewer source', () => {
        withSignIns(['connection-1']);
        renderWithProviders(<LiveSourceExploreBadge explore={explore} />);
        expect(screen.getByText('Live · your access')).toBeInTheDocument();
    });

    it('stays a plain live badge on a source with one shared sign-in', () => {
        withSignIns(['another-connection']);
        renderWithProviders(<LiveSourceExploreBadge explore={explore} />);
        expect(screen.getByText('Live')).toBeInTheDocument();
        expect(screen.queryByText('Live · your access')).toBeNull();
    });
});
