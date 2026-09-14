import { DbtProjectType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { HeaderCreate } from './HeaderCreate';

const mocks = vi.hoisted(() => ({
    project: {
        name: 'Jaffle',
        dbtConnection: {
            type: 'bitbucket',
            host_domain: undefined as string | undefined,
            semanticLayer: undefined as 'dbt' | 'lightdash' | undefined,
        },
    },
    hasGithub: false,
    gitEnabled: false,
    canWrite: true,
    dispatch: vi.fn(),
}));
const state = {
    sqlRunner: {
        projectUuid: 'project',
        name: 'SQL query',
        sqlColumns: [],
        selectedChartType: null,
        modals: {
            saveChartModal: { isOpen: false },
            createVirtualViewModal: { isOpen: false },
            writeBackToDbtModal: { isOpen: false },
            chartErrorsAlert: { isOpen: false },
        },
    },
};
vi.mock('../../store/hooks', () => ({
    useAppDispatch: () => mocks.dispatch,
    useAppSelector: (selector: (value: typeof state) => unknown) =>
        selector(state),
}));
vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({ data: mocks.project }),
}));
vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            hasGithub: mocks.hasGithub,
            siteUrl: 'https://app.example.com',
        },
    }),
}));
vi.mock('../../../../hooks/gitIntegration/useGitIntegration', () => ({
    useGitIntegration: () => ({ data: { enabled: mocks.gitEnabled } }),
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: undefined },
        user: {
            data: {
                organizationUuid: 'organization',
                ability: {
                    can: (
                        _action: string,
                        resource: { __caslSubjectType__: string },
                    ) =>
                        resource.__caslSubjectType__ === 'SourceCode' &&
                        mocks.canWrite,
                },
            },
        },
    }),
}));
vi.mock('../../../../hooks/user/useCreateInAnySpaceAccess', () => ({
    default: () => false,
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn() }),
}));
vi.mock('../../hooks/useSqlRunnerShareUrl', () => ({
    useCreateSqlRunnerShareUrl: () => vi.fn(),
}));
vi.mock('../../../../components/DataViz/store/selectors', () => ({
    cartesianChartSelectors: { getErrors: () => null },
}));
vi.mock(
    '../../../../components/VisualizationConfigs/common/EditableText',
    () => ({ EditableText: () => null }),
);
vi.mock('../../../virtualView', () => ({ CreateVirtualViewModal: () => null }));
vi.mock('../SaveSqlChartModal', () => ({ SaveSqlChartModal: () => null }));
vi.mock('../WriteBackToDbtModal', () => ({ WriteBackToDbtModal: () => null }));
vi.mock('../ChartErrorsAlert', () => ({ ChartErrorsAlert: () => null }));

beforeEach(() => {
    mocks.project.dbtConnection.type = DbtProjectType.BITBUCKET;
    mocks.project.dbtConnection.host_domain = undefined;
    mocks.project.dbtConnection.semanticLayer = undefined;
    mocks.hasGithub = false;
    mocks.gitEnabled = false;
    mocks.canWrite = true;
    mocks.dispatch.mockClear();
});

describe('SQL writeback header', () => {
    it('opens Bitbucket Cloud writeback without GitHub configuration', () => {
        renderWithProviders(<HeaderCreate />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Write back to dbt' }),
        );
        expect(mocks.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ payload: 'writeBackToDbtModal' }),
        );
    });
    it('keeps SQL model creation disabled for native GitHub projects', () => {
        mocks.project.dbtConnection.type = DbtProjectType.GITHUB;
        mocks.project.dbtConnection.semanticLayer = 'lightdash';
        mocks.hasGithub = true;
        mocks.gitEnabled = true;
        renderWithProviders(<HeaderCreate />);
        expect(
            screen.getByRole('button', { name: 'Write back to dbt' }),
        ).toBeDisabled();
        expect(mocks.dispatch).not.toHaveBeenCalled();
    });
    it('does not offer writeback without SourceCode permission', () => {
        mocks.canWrite = false;
        renderWithProviders(<HeaderCreate />);
        expect(
            screen.queryByRole('button', { name: 'Write back to dbt' }),
        ).not.toBeInTheDocument();
    });
    it.each(['bitbucket.internal', 'bitbucket.org.evil.test'])(
        'keeps unsupported host %s disabled',
        (host) => {
            mocks.project.dbtConnection.host_domain = host;
            renderWithProviders(<HeaderCreate />);
            expect(
                screen.getByRole('button', { name: 'Write back to dbt' }),
            ).toBeDisabled();
        },
    );
    it.each([DbtProjectType.GITHUB, DbtProjectType.GITLAB])(
        'preserves %s integration requirements',
        (type) => {
            mocks.project.dbtConnection.type = type;
            const { rerender } = renderWithProviders(<HeaderCreate />);
            expect(
                screen.getByRole('button', { name: 'Write back to dbt' }),
            ).toBeDisabled();
            mocks.hasGithub = true;
            rerender(<HeaderCreate />);
            expect(
                screen.getByRole('button', { name: 'Write back to dbt' }),
            ).toBeDisabled();
            mocks.gitEnabled = true;
            rerender(<HeaderCreate />);
            expect(
                screen.getByRole('button', { name: 'Write back to dbt' }),
            ).toBeEnabled();
        },
    );
});
