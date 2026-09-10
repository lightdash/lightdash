import {
    DbtProjectType,
    MetricType,
    CustomDimensionType,
    DimensionType,
    BinType,
    type CustomDimension,
    type AdditionalMetric,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, fireEvent, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { useIsGitProject, useSupportsCustomFieldWriteBack } from './hooks';
import { SingleItemModalContent, WriteBackModal } from './index';

const project = vi.hoisted(() => ({
    type: 'github',
    host_domain: undefined as string | undefined,
    semanticLayer: undefined as 'dbt' | 'lightdash' | undefined,
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: { dbtConnection: project } }),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../common/CodeBlock/CodeBlock', () => ({
    default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

const metric: AdditionalMetric = {
    name: 'total_amount',
    label: 'Total amount',
    table: 'orders',
    type: MetricType.SUM,
    sql: '${TABLE}.amount',
    baseDimensionName: 'amount',
};
const renderModal = (item: AdditionalMetric | CustomDimension = metric) =>
    renderWithProviders(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <SingleItemModalContent
                handleClose={vi.fn()}
                projectUuid="project"
                item={item}
            />
        </QueryClientProvider>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    project.type = DbtProjectType.GITHUB;
    project.host_domain = undefined;
    project.semanticLayer = undefined;
});

describe('custom field writeback modal', () => {
    it('allows a metric submission without requesting a dimension preview', () => {
        renderModal();
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeEnabled();
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(
            screen.queryByText('Generating warehouse-aware preview...'),
        ).not.toBeInTheDocument();
    });

    it.each([
        [DbtProjectType.GITHUB, undefined, true, undefined],
        [DbtProjectType.GITHUB, undefined, true, 'lightdash'],
        [DbtProjectType.GITLAB, undefined, true, undefined],
        [DbtProjectType.BITBUCKET, undefined, true, undefined],
        [DbtProjectType.BITBUCKET, ' BITBUCKET.ORG. ', true, undefined],
        [DbtProjectType.BITBUCKET, 'bitbucket.internal', false, undefined],
        [DbtProjectType.BITBUCKET, 'bitbucket.org.evil.test', false, undefined],
        [DbtProjectType.DBT, undefined, false, undefined],
    ] as const)(
        'allows %s on host %s: %s',
        (type, host, supported, semanticLayer) => {
            project.type = type;
            project.host_domain = host;
            project.semanticLayer = semanticLayer;
            renderModal();
            const button = screen.getByRole('button', {
                name: 'Open Pull Request',
            });
            if (supported) {
                expect(button).toBeEnabled();
            } else {
                expect(button).toBeDisabled();
            }
        },
    );

    it('does not enable Source Editor or ContentAsCode through the generic Git hook', () => {
        project.type = DbtProjectType.BITBUCKET;
        const { result } = renderHook(() => ({
            customFields: useSupportsCustomFieldWriteBack('project'),
            genericGit: useIsGitProject('project'),
        }));
        expect(result.current).toEqual({
            customFields: true,
            genericGit: false,
        });
    });

    it('submits a Bitbucket metric and displays the returned pull request link', async () => {
        project.type = DbtProjectType.BITBUCKET;
        const prUrl = 'https://bitbucket.org/workspace/jaffle/pull-requests/7';
        vi.mocked(lightdashApi).mockResolvedValue({
            prUrl,
            prTitle: 'Add metric',
        });
        vi.spyOn(window, 'open').mockImplementation(() => null);
        renderModal();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        );
        await waitFor(() =>
            expect(screen.getByRole('link', { name: '#7' })).toHaveAttribute(
                'href',
                prUrl,
            ),
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/git-integration/pull-requests/custom-metrics',
                method: 'POST',
                body: JSON.stringify({ customMetrics: [metric] }),
            }),
        );
        vi.restoreAllMocks();
    });

    it('waits for the warehouse-aware dimension preview before permitting submission', async () => {
        project.type = DbtProjectType.BITBUCKET;
        const dimension: CustomDimension = {
            id: 'amount',
            name: 'Amount',
            table: 'orders',
            type: CustomDimensionType.SQL,
            dimensionType: DimensionType.NUMBER,
            sql: '${orders.amount}',
        };
        vi.mocked(lightdashApi).mockResolvedValue({
            yaml: 'amount: test-preview',
        });
        renderModal(dimension);
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeDisabled();
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Open Pull Request' }),
            ).toBeEnabled(),
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/git-integration/pull-requests/custom-dimensions/preview',
                body: JSON.stringify({ customDimensions: [dimension] }),
            }),
        );
        expect(screen.getByText('amount: test-preview')).toBeVisible();
    });

    it('enables a bulk metric submission after selecting metrics without a dimension preview', () => {
        project.type = DbtProjectType.BITBUCKET;
        const store = createExplorerStore();
        store.dispatch(
            explorerActions.toggleWriteBackModal({
                items: [
                    metric,
                    { ...metric, name: 'other', label: 'Other amount' },
                ],
            }),
        );
        renderWithProviders(
            <QueryClientProvider client={new QueryClient()}>
                <Provider store={store}>
                    <WriteBackModal />
                </Provider>
            </QueryClientProvider>,
        );
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByText('Total amount'));
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeEnabled();
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('keeps unsupported fixed-number bins disabled without requesting a preview', () => {
        project.type = DbtProjectType.BITBUCKET;
        renderModal({
            id: 'amount_bin',
            name: 'Amount bin',
            table: 'orders',
            type: CustomDimensionType.BIN,
            binType: BinType.FIXED_NUMBER,
            binNumber: 5,
            dimensionId: 'orders_amount',
        });
        expect(
            screen.getByRole('button', { name: 'Open Pull Request' }),
        ).toBeDisabled();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
