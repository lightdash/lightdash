import {
    DbtProjectType,
    FeatureFlags,
    type DbtProjectConfig,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import ProjectFormContext from '../context';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { FormProvider, useForm } from '../formContext';
import { PostgresDefaultValues } from '../WarehouseForms/defaultValues';
import StartOfWeekSelect from './StartOfWeekSelect';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const mockFlag = (enabled: boolean) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: FeatureFlags.EnableTimezoneSupport, enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const mockFlagLoading = () => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: undefined,
        isLoading: true,
    } as ReturnType<typeof useServerFeatureFlag>);
};

const cliDeployedDbt: DbtProjectConfig = { type: DbtProjectType.NONE };

const githubDbt: DbtProjectConfig = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    personal_access_token: 'token',
    repository: 'org/repo',
    branch: 'main',
    project_sub_path: '/',
};

const renderStartOfWeekSelect = ({
    dbt,
    startOfWeek,
    isRedeployRequired,
}: {
    dbt: DbtProjectConfig;
    startOfWeek: number | null;
    isRedeployRequired?: boolean;
}) => {
    const Wrapper: FC = () => {
        const form = useForm({
            initialValues: {
                name: 'test project',
                dbt,
                warehouse: { ...PostgresDefaultValues, startOfWeek },
                dbtVersion: dbtDefaults.dbtVersion,
            },
        });

        return (
            <ProjectFormContext.Provider value={{}}>
                <FormProvider form={form}>
                    <StartOfWeekSelect
                        disabled={false}
                        isRedeployRequired={isRedeployRequired}
                    />
                </FormProvider>
            </ProjectFormContext.Provider>
        );
    };

    return renderWithProviders(<Wrapper />);
};

const expectNoAlert = async () => {
    await screen.findByLabelText('Start of week', { selector: 'input' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Required CLI option')).not.toBeInTheDocument();
};

describe('StartOfWeekSelect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows no alert for a CLI-deployed project when the timezone flag is on', async () => {
        mockFlag(true);
        renderStartOfWeekSelect({ dbt: cliDeployedDbt, startOfWeek: 0 });

        await expectNoAlert();
        expect(
            screen.getByText(/Changes apply straight away/),
        ).toBeInTheDocument();
    });

    it('shows no alert for a dbt Cloud / GitHub connection when the timezone flag is on', async () => {
        mockFlag(true);
        renderStartOfWeekSelect({ dbt: githubDbt, startOfWeek: 0 });

        await expectNoAlert();
    });

    it('shows the CLI option alert with the day name when the timezone flag is off for a CLI-deployed project', async () => {
        mockFlag(false);
        renderStartOfWeekSelect({ dbt: cliDeployedDbt, startOfWeek: 0 });

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Required CLI option');
        expect(alert).toHaveTextContent('--start-of-week=0');
        expect(alert).toHaveTextContent('(Monday)');
        expect(
            screen.queryByText(/Changes apply straight away/),
        ).not.toBeInTheDocument();
    });

    it('shows no alert for a dbt Cloud / GitHub connection when the timezone flag is off', async () => {
        mockFlag(false);
        renderStartOfWeekSelect({ dbt: githubDbt, startOfWeek: 0 });

        await expectNoAlert();
    });

    it('shows no alert while the timezone flag is loading', async () => {
        mockFlagLoading();
        renderStartOfWeekSelect({ dbt: cliDeployedDbt, startOfWeek: 0 });

        await expectNoAlert();
    });

    it('shows no alert when no day is selected', async () => {
        mockFlag(false);
        renderStartOfWeekSelect({ dbt: cliDeployedDbt, startOfWeek: null });

        await expectNoAlert();
    });

    it('shows no alert when isRedeployRequired is false', async () => {
        mockFlag(false);
        renderStartOfWeekSelect({
            dbt: cliDeployedDbt,
            startOfWeek: 0,
            isRedeployRequired: false,
        });

        await expectNoAlert();
    });
});
