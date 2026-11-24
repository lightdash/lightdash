import {
    CiCheckState,
    CiMergeState,
    CiProviderType,
    type CiChecks,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { workspaceOf } from './studioCheckout.mock';
import { StudioWorkspacesList } from './StudioWorkspacesList';

const current = workspaceOf('A', { isActive: true });
const mine = workspaceOf('B');
const reviewed = workspaceOf('F', {
    pullRequest: { url: 'https://github.com/o/r/pull/7', state: 'open' },
});
const teammates = workspaceOf('C', {
    isMine: false,
    owner: { userUuid: 'them', name: 'Sam' },
});
const published = workspaceOf('D', {
    finishedAt: new Date(),
    publishedLive: true,
});
const discarded = workspaceOf('E', { finishedAt: new Date() });

const failedChecks: CiChecks = {
    provider: CiProviderType.GITHUB,
    overall: CiCheckState.FAILURE,
    mergeState: CiMergeState.BLOCKED,
    merged: false,
    state: 'open',
    checks: [],
};

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

beforeEach(() => {
    api.mockReset();
    api.mockImplementation(({ url }: { url: string }) => {
        if (url.endsWith('/semantic-studio/status')) {
            return Promise.resolve({
                enabled: true,
                blocker: null,
                appliesAs: 'dbt_pull_request',
            });
        }
        if (url.endsWith('/semantic-studio/workspaces')) {
            return Promise.resolve({
                mine: [current, mine, reviewed],
                others: [teammates],
                recent: [published, discarded],
            });
        }
        if (url.includes('/ai-writeback/ci-checks?')) {
            return Promise.resolve(failedChecks);
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
    });
});

const renderList = async () => {
    const onOpen = vi.fn();
    const onCheckOut = vi.fn();
    renderWithProviders(
        <StudioWorkspacesList
            projectUuid="project"
            saving={null}
            onOpen={onOpen}
            onCheckOut={onCheckOut}
            isCheckingOut={false}
        />,
    );
    await screen.findByText('Change A');
    return { onOpen, onCheckOut };
};

describe('StudioWorkspacesList', () => {
    it('checks out one of your open changes from its row', async () => {
        const user = userEvent.setup();
        const { onOpen, onCheckOut } = await renderList();
        const buttons = screen.getAllByRole('button', { name: 'Check out' });
        // The change already checked out has nothing to check out.
        expect(buttons).toHaveLength(2);
        const rowOfB = buttons.find((button) =>
            button.parentElement?.textContent?.includes('Change B'),
        );
        if (!rowOfB) throw new Error('No row for Change B');
        await user.click(rowOfB);
        expect(onCheckOut).toHaveBeenCalledWith(mine);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('says when the checks on a pull request failed', async () => {
        await renderList();
        expect(await screen.findByText('Checks failed')).toBeInTheDocument();
    });

    it("opens a teammate's change without checking it out", async () => {
        const user = userEvent.setup();
        const { onOpen, onCheckOut } = await renderList();
        await user.click(screen.getByRole('button', { name: /Change C/ }));
        expect(onOpen).toHaveBeenCalledWith(teammates);
        expect(onCheckOut).not.toHaveBeenCalled();
    });

    it('lists a draft published without a pull request, not a discarded one', async () => {
        await renderList();
        expect(
            screen.getByRole('button', { name: /Change D.*Published/ }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Change E')).not.toBeInTheDocument();
    });
});
