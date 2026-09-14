import { DbtProjectType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { renderWithProviders } from '../../../testing/testUtils';
import { WriteBackToDbtModal } from './WriteBackToDbtModal';

const mocks = vi.hoisted(() => ({
    project: {
        dbtConnection: {
            type: 'bitbucket',
            host_domain: undefined as string | undefined,
        },
    },
    hasGithub: false,
    showToastError: vi.fn(),
}));
const state = {
    sqlRunner: {
        projectUuid: 'project',
        sql: 'select 1 as amount',
        sqlColumns: [{ name: 'amount', type: 'number' }],
    },
};
vi.mock('../store/hooks', () => ({
    useAppSelector: (selector: (value: typeof state) => unknown) =>
        selector(state),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: mocks.project }),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { hasGithub: mocks.hasGithub } }),
}));
vi.mock(
    '../../../components/common/GithubIntegration/hooks/useGithubIntegration',
    () => ({ useGithubUserCredential: () => ({ data: undefined }) }),
);
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: mocks.showToastError }),
}));
vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
const onClose = vi.fn();
const renderModal = () =>
    renderWithProviders(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <WriteBackToDbtModal opened onClose={onClose} />
        </QueryClientProvider>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.dbtConnection.type = DbtProjectType.BITBUCKET;
    mocks.project.dbtConnection.host_domain = undefined;
    mocks.hasGithub = false;
    vi.mocked(lightdashApi).mockImplementation(async ({ url }) =>
        url.endsWith('/preview')
            ? {
                  repo: 'workspace/jaffle',
                  url: 'https://bitbucket.org/workspace/jaffle',
                  files: ['models/new_model.sql', 'models/new_model.yml'],
              }
            : {
                  prUrl: 'https://bitbucket.org/workspace/jaffle/pull-requests/7',
                  prTitle: 'Add revenue',
              },
    );
});
afterEach(() => vi.restoreAllMocks());

describe('SQL writeback modal', () => {
    it('previews and submits Bitbucket without a GitHub integration or OAuth prompt', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        renderModal();
        await waitFor(() =>
            expect(screen.getByText('new_model.sql')).toBeVisible(),
        );
        expect(screen.getByText('new_model.yml')).toBeVisible();
        expect(
            screen.queryByText('Connect your GitHub account'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('workspace/jaffle'));
        expect(open).toHaveBeenCalledWith(
            'https://bitbucket.org/workspace/jaffle',
            '_blank',
            'noopener,noreferrer',
        );
        fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
            target: { value: 'revenue' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        );
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/project/sqlRunner/pull-request',
            method: 'POST',
            body: JSON.stringify({
                name: 'revenue',
                sql: state.sqlRunner.sql,
                columns: state.sqlRunner.sqlColumns,
            }),
        });
        expect(open).toHaveBeenCalledWith(
            'https://bitbucket.org/workspace/jaffle/pull-requests/7',
            '_blank',
            'noopener,noreferrer',
        );
    });
    it('does not preview or submit for Bitbucket Server', () => {
        mocks.project.dbtConnection.host_domain = 'bitbucket.internal';
        renderModal();
        fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
            target: { value: 'revenue' },
        });
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeDisabled();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it.each(['success', 'failure'])(
        'keeps the latest preview when an older request ends in %s',
        async (outcome) => {
            let settleOldRequest = () => {};
            const oldRequest = new Promise<{
                repo: string;
                url: string;
                files: string[];
            }>((resolve, reject) => {
                settleOldRequest = () => {
                    if (outcome === 'failure') {
                        reject({ error: { message: 'Old preview failed' } });
                    } else {
                        resolve({
                            repo: 'old',
                            url: 'https://bitbucket.org/workspace/jaffle',
                            files: ['models/old.sql'],
                        });
                    }
                };
            });
            vi.mocked(lightdashApi).mockReturnValueOnce(oldRequest);
            renderModal();
            fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
                target: { value: 'latest' },
            });
            await waitFor(() =>
                expect(screen.getByText('new_model.sql')).toBeVisible(),
            );
            await act(async () => {
                settleOldRequest();
                await oldRequest.catch(() => undefined);
            });
            expect(screen.getByText('new_model.sql')).toBeVisible();
            expect(screen.queryByText('old.sql')).not.toBeInTheDocument();
        },
    );

    it('shows the provider error when preview fails', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Update the Bitbucket project API token' },
        });
        renderModal();
        await waitFor(() =>
            expect(mocks.showToastError).toHaveBeenCalledWith({
                title: 'Failed to preview dbt writeback',
                subtitle: 'Update the Bitbucket project API token',
            }),
        );
        expect(screen.queryByText('new_model.sql')).not.toBeInTheDocument();
    });
});
