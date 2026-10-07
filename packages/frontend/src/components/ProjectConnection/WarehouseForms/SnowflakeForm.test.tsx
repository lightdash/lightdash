import {
    FeatureFlags,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type Project,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
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
    saving: false,
    loading: false,
    policyEnabled: false,
    readPolicy: vi.fn(),
    savePolicy: vi.fn(),
    mutate: vi.fn(),
    toast: vi.fn(),
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
        data: { enabled: flag === FeatureFlags.AiPrincipals && mocks.enabled },
    }),
}));
vi.mock('../../../features/aiAccess/api', () => ({
    useAiAccessPolicy: (...args: unknown[]) => {
        mocks.readPolicy(...args);
        return {
            data: { enabled: mocks.policyEnabled, principalKind: 'person' },
            isLoading: mocks.loading,
            isError: false,
        };
    },
    useUpsertAiAccessPolicy: (...args: unknown[]) => {
        mocks.savePolicy(...args);
        return { mutate: mocks.mutate, isLoading: mocks.saving };
    },
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: mocks.toast }),
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
    );
};

describe('SnowflakeForm agent identity requirement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.canManage = true;
        mocks.enabled = true;
        mocks.configured = true;
        mocks.saving = false;
        mocks.loading = false;
        mocks.policyEnabled = false;
    });
    it.each([null, 'extra-connection'])(
        'saves immediately for connection %s',
        (connection) => {
            renderWithProviders(
                <TestForm
                    connection={connection}
                    extra={connection !== null}
                />,
            );
            const toggle = screen.getByRole('switch', {
                name: /^Require agent identity/,
            });
            expect(toggle).not.toBeChecked();
            expect(mocks.readPolicy).toHaveBeenCalledWith(
                'project',
                connection,
            );
            expect(mocks.savePolicy).toHaveBeenCalledWith(
                'project',
                connection,
            );
            fireEvent.click(toggle);
            expect(mocks.mutate).toHaveBeenCalledWith(
                {
                    enabled: true,
                    principalKind: 'person',
                    transport: { kind: 'direct' },
                    sharedRef: null,
                    twinNameTemplate: null,
                    groupMappings: [],
                    policySource: null,
                },
                expect.objectContaining({ onSuccess: expect.any(Function) }),
            );
            const options = mocks.mutate.mock.calls[0][1] as {
                onSuccess: () => void;
            };
            options.onSuccess();
            expect(mocks.toast).toHaveBeenCalledWith({
                title: 'Agent identity requirement saved.',
            });
        },
    );
    it('shows the saved requirement and can turn it off', () => {
        mocks.policyEnabled = true;
        renderWithProviders(<TestForm />);
        const toggle = screen.getByRole('switch', {
            name: /^Require agent identity/,
        });
        expect(toggle).toBeChecked();
        fireEvent.click(toggle);
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: false }),
            expect.any(Object),
        );
    });
    it('disables the requirement and offers instance setup when unconfigured', () => {
        mocks.configured = false;
        renderWithProviders(<TestForm />);
        expect(
            screen.getByRole('switch', { name: /^Require agent identity/ }),
        ).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Set up the Snowflake agent integration',
            }),
        );
        expect(
            screen.getByText(/CREATE SECURITY INTEGRATION/),
        ).toHaveTextContent(
            "OAUTH_REDIRECT_URI = 'https://instance.example/api/v1/oauth/redirect/snowflake-ai'",
        );
        expect(
            screen.getByText(/Set SNOWFLAKE_AI_OAUTH_CLIENT_ID/),
        ).toBeInTheDocument();
    });
    it('disables the switch while saving', () => {
        mocks.saving = true;
        renderWithProviders(<TestForm />);
        expect(
            screen.getByRole('switch', { name: /^Require agent identity/ }),
        ).toBeDisabled();
        expect(
            screen.getByRole('switch', { name: /^Require agent identity/ }),
        ).toHaveAttribute('aria-busy', 'true');
    });
    it('waits for the saved policy before showing the switch', () => {
        mocks.loading = true;
        renderWithProviders(<TestForm />);
        expect(
            screen.queryByRole('switch', { name: /^Require agent identity/ }),
        ).not.toBeInTheDocument();
    });
    it.each([
        'create',
        'flag-off',
        'non-manager',
        'dbt-source',
        'unsaved-extra',
    ])('hides the policy for %s', (mode) => {
        mocks.enabled = mode !== 'flag-off';
        mocks.canManage = mode !== 'non-manager';
        renderWithProviders(
            <TestForm
                edit={mode !== 'create'}
                dbtSource={mode === 'dbt-source'}
                extra={mode === 'unsaved-extra'}
            />,
        );
        expect(
            screen.queryByRole('switch', { name: /^Require agent identity/ }),
        ).not.toBeInTheDocument();
        expect(mocks.readPolicy).not.toHaveBeenCalled();
    });
});
