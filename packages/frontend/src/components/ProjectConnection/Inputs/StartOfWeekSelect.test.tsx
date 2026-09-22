import {
    DbtProjectType,
    FeatureFlags,
    type DbtProjectConfig,
} from '@lightdash/common';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import ProjectFormContext from '../context';
import { dbtDefaults } from '../DbtForms/defaultValues';
import {
    FormProvider,
    useForm,
    useFormContext,
    type Form,
} from '../formContext';
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

const cliDeployedDbt: DbtProjectConfig = { type: DbtProjectType.NONE };

const githubDbt: DbtProjectConfig = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    personal_access_token: 'token',
    repository: 'org/repo',
    branch: 'main',
    project_sub_path: '/',
};

const FormProbe: FC<{ formRef: { current: Form | null } }> = ({ formRef }) => {
    formRef.current = useFormContext();
    return null;
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
    const formRef: { current: Form | null } = { current: null };

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
                    <FormProbe formRef={formRef} />
                </FormProvider>
            </ProjectFormContext.Provider>
        );
    };

    return { formRef, ...renderWithProviders(<Wrapper />) };
};

describe('StartOfWeekSelect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the new copy with the day name when the timezone flag is on for a CLI-deployed project', async () => {
        mockFlag(true);
        const { findByText, queryByText, container } = renderStartOfWeekSelect({
            dbt: cliDeployedDbt,
            startOfWeek: 0,
        });

        expect(
            await findByText('Date columns need a deploy'),
        ).toBeInTheDocument();
        expect(queryByText('Required CLI option')).not.toBeInTheDocument();
        const alertMessage = container.querySelector('.mantine-Alert-message');
        expect(alertMessage?.textContent).toContain('(Monday)');
    });

    it('keeps the existing copy when the timezone flag is off for a CLI-deployed project', async () => {
        mockFlag(false);
        const { findByText, queryByText } = renderStartOfWeekSelect({
            dbt: cliDeployedDbt,
            startOfWeek: 0,
        });

        expect(await findByText('Required CLI option')).toBeInTheDocument();
        expect(
            queryByText('Date columns need a deploy'),
        ).not.toBeInTheDocument();
    });

    it('shows no alert for a dbt Cloud / GitHub connection when the flag is on', async () => {
        mockFlag(true);
        const { queryByText, findByLabelText } = renderStartOfWeekSelect({
            dbt: githubDbt,
            startOfWeek: 0,
        });
        await findByLabelText('Start of week', { selector: 'input' });
        expect(
            queryByText('Date columns need a deploy'),
        ).not.toBeInTheDocument();
        expect(queryByText('Required CLI option')).not.toBeInTheDocument();
    });

    it('shows no alert for a dbt Cloud / GitHub connection when the flag is off', async () => {
        mockFlag(false);
        const { queryByText, findByLabelText } = renderStartOfWeekSelect({
            dbt: githubDbt,
            startOfWeek: 0,
        });
        await findByLabelText('Start of week', { selector: 'input' });
        expect(
            queryByText('Date columns need a deploy'),
        ).not.toBeInTheDocument();
        expect(queryByText('Required CLI option')).not.toBeInTheDocument();
    });

    it('shows no alert when no day is selected', async () => {
        mockFlag(true);
        const { queryByText, findByLabelText } = renderStartOfWeekSelect({
            dbt: cliDeployedDbt,
            startOfWeek: null,
        });

        await findByLabelText('Start of week', { selector: 'input' });
        expect(
            queryByText('Date columns need a deploy'),
        ).not.toBeInTheDocument();
        expect(queryByText('Required CLI option')).not.toBeInTheDocument();
    });

    it('shows no alert when isRedeployRequired is false', async () => {
        mockFlag(true);
        const { queryByText, findByLabelText } = renderStartOfWeekSelect({
            dbt: cliDeployedDbt,
            startOfWeek: 0,
            isRedeployRequired: false,
        });

        await findByLabelText('Start of week', { selector: 'input' });
        expect(
            queryByText('Date columns need a deploy'),
        ).not.toBeInTheDocument();
        expect(queryByText('Required CLI option')).not.toBeInTheDocument();
    });
});
