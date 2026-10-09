import {
    FeatureFlags,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type Project,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { unusedDbtFormValues } from '../connectionFormDefaults';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import SnowflakeForm from './SnowflakeForm';

const mocks = vi.hoisted(() => ({
    canManage: true,
    enabled: true,
    configured: true,
    requirementSource: 'organization' as 'organization' | null,
    readAccess: vi.fn(),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: {
                rudder: {},
                auth: { snowflakeAi: { enabled: mocks.configured } },
                siteUrl: 'https://instance.example/',
            },
            isLoading: false,
            isError: false,
        },
        user: { data: { ability: { can: () => mocks.canManage } } },
    }),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: 'project', organizationUuid: 'org' },
    }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: { enabled: flag === FeatureFlags.AgentIdentity && mocks.enabled },
    }),
}));
vi.mock('../../../features/aiAccess/api', () => ({
    useMyAiAccess: (...args: unknown[]) => {
        mocks.readAccess(...args);
        return { data: { requirementSource: mocks.requirementSource } };
    },
}));
vi.mock(
    '../../../hooks/organization/useOrganizationWarehouseCredentials',
    () => ({ useOrganizationWarehouseCredentials: () => ({ data: [] }) }),
);
vi.mock('../../../hooks/useSnowflake', () => ({
    useIsSnowflakeAuthenticated: () => ({ data: undefined, error: null }),
    useSnowflakeDatasets: () => ({ refetch: vi.fn() }),
    useSnowflakeLoginPopup: () => ({ mutate: vi.fn(), isSsoEnabled: false }),
}));
vi.mock('./DataTimezoneField', () => ({ default: () => null }));
vi.mock('../Inputs/StartOfWeekSelect', () => ({ default: () => null }));
vi.mock('../../common/CodeBlock/CodeBlock', () => ({
    default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

const warehouse = {
    type: WarehouseTypes.SNOWFLAKE as const,
    authenticationType: SnowflakeAuthenticationType.PASSWORD as const,
    account: 'account',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'public',
    user: 'person',
    password: '',
};
const TestForm = ({
    edit = true,
    connection,
    extra = false,
    dbtSource = false,
}: {
    edit?: boolean;
    connection?: string | null;
    extra?: boolean;
    dbtSource?: boolean;
}) => {
    const form = useForm({
        initialValues: { name: 'Project', ...unusedDbtFormValues, warehouse },
    });
    return (
        <MemoryRouter>
            <FormProvider form={form}>
                <ProjectFormProvider
                    savedProject={
                        edit
                            ? ({
                                  projectUuid: extra ? undefined : 'project',
                                  warehouseConnection: warehouse,
                              } as unknown as Project)
                            : undefined
                    }
                    projectUuid={extra ? 'project' : undefined}
                    isProjectExtraConnection={extra}
                    isDbtSource={dbtSource}
                    warehouseConnectionUuid={connection}
                >
                    <SnowflakeForm disabled={false} />
                </ProjectFormProvider>
            </FormProvider>
        </MemoryRouter>
    );
};

describe('SnowflakeForm agent identity requirement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.canManage = true;
        mocks.enabled = true;
        mocks.configured = true;
        mocks.requirementSource = 'organization';
    });
    it.each([null, 'extra-connection'])(
        'shows the organisation requirement for connection %s',
        (connection) => {
            renderWithProviders(
                <TestForm
                    connection={connection}
                    extra={connection !== null}
                />,
            );
            expect(
                screen.getByText(
                    /Agent identity required by your organisation/,
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: 'Organisation settings' }),
            ).toHaveAttribute('href', '/generalSettings/agentIdentity');
            expect(mocks.readAccess).toHaveBeenCalledWith(
                'project',
                connection,
            );
            expect(
                screen.queryByRole('switch', {
                    name: /^Require agent identity/,
                }),
            ).not.toBeInTheDocument();
        },
    );
    it('shows the read-only requirement to non-managers', () => {
        mocks.canManage = false;
        renderWithProviders(<TestForm />);
        expect(
            screen.getByText(/Agent identity required by your organisation/),
        ).toBeInTheDocument();
    });
    it.each([
        'create',
        'flag-off',
        'no-requirement',
        'dbt-source',
        'unsaved-extra',
    ])('hides the indicator for %s', (mode) => {
        mocks.enabled = mode !== 'flag-off';
        mocks.requirementSource =
            mode === 'no-requirement' ? null : 'organization';
        renderWithProviders(
            <TestForm
                edit={mode !== 'create'}
                dbtSource={mode === 'dbt-source'}
                extra={mode === 'unsaved-extra'}
            />,
        );
        expect(
            screen.queryByText(/Agent identity required/),
        ).not.toBeInTheDocument();
    });
});
