import {
    DbtProjectType,
    type OnboardingConnectionValidationResult,
    type ValidateOnboardingConnectionRequest,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbtDefaults } from '../../../../components/ProjectConnection/DbtForms/defaultValues';
import {
    FormProvider,
    useForm,
} from '../../../../components/ProjectConnection/formContext';
import { SnowflakeDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type ParsedConnectResult } from '../../utils/configureHelpers';
import ConfigurePhase from './ConfigurePhase';

// Slightly longer than ConfigurePhase's 600ms debounce.
const VALIDATION_DEBOUNCE_WAIT_MS = 800;

const mutateAsync = vi.fn();

vi.mock('../../hooks/useValidateConnection', () => ({
    useValidateConnection: () => ({ mutateAsync }),
}));

const passed = (
    schemas: OnboardingConnectionValidationResult['schemas'],
    inventory: OnboardingConnectionValidationResult['inventory'] = null,
): OnboardingConnectionValidationResult => ({
    diagnostic: { status: 'passed', checks: [] },
    schemas,
    inventory,
});

const baseParsed: ParsedConnectResult = {
    inventory: {
        databases: [
            { name: 'ANALYTICS', comment: null, kind: null },
            { name: 'RAW', comment: null, kind: null },
        ],
        warehouses: [
            {
                name: 'COMPUTE_WH',
                size: 'X-Small',
                state: 'STARTED',
                autoSuspendSeconds: 60,
            },
        ],
        roles: [
            { name: 'READER', isDefault: true },
            { name: 'ACCOUNTADMIN', isDefault: false },
        ],
    },
    connectionValues: {
        database: 'ANALYTICS',
        warehouse: 'COMPUTE_WH',
        role: null,
        schema: null,
    },
    connectionValueSources: {
        database: 'default',
        warehouse: 'default',
        role: 'missing',
        schema: 'missing',
    },
};

const Harness: FC<{
    parsed?: ParsedConnectResult;
    onReconnect?: () => void;
}> = ({ parsed = baseParsed, onReconnect = vi.fn() }) => {
    const form = useForm({
        initialValues: {
            name: '',
            dbt: dbtDefaults.formValues[DbtProjectType.NONE],
            warehouse: SnowflakeDefaultValues,
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
    });
    return (
        <FormProvider form={form}>
            <ConfigurePhase
                projectUuid="p1"
                parsed={parsed}
                isSubmitting={false}
                onSubmit={vi.fn()}
                onReconnect={onReconnect}
            />
        </FormProvider>
    );
};

const authFailed = (): OnboardingConnectionValidationResult => ({
    diagnostic: {
        status: 'failed',
        checks: [
            {
                id: 'open_connection',
                label: 'Open secure connection',
                status: 'passed',
                durationMs: 10,
                diagnosis: null,
            },
            {
                id: 'authenticate',
                label: 'Authenticate',
                status: 'failed',
                durationMs: 20,
                diagnosis: {
                    title: 'Your Snowflake connection has expired',
                    detail: 'Reconnect through the CLI to continue.',
                    remedySql: null,
                    docsUrl: null,
                },
            },
        ],
    },
    schemas: null,
    inventory: null,
});

describe('ConfigurePhase', () => {
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        mutateAsync.mockReset();
    });

    it('auto-selects the schema with the most tables after validation', async () => {
        mutateAsync.mockResolvedValue(
            passed([
                { name: 'PUBLIC', tableCount: 2 },
                { name: 'MARTS', tableCount: 9 },
            ]),
        );
        renderWithProviders(<Harness />);

        // db + warehouse are preselected from defaults, so validation fires.
        await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
        expect(
            await screen.findByDisplayValue('MARTS — 9 tables'),
        ).toBeInTheDocument();
    });

    it('clears a stale schema when the database changes and re-picks for the new database', async () => {
        mutateAsync.mockImplementation(
            ({ connectionValues }: ValidateOnboardingConnectionRequest) =>
                Promise.resolve(
                    passed(
                        connectionValues.database === 'RAW'
                            ? [
                                  { name: 'STAGING', tableCount: 3 },
                                  { name: 'CORE', tableCount: 12 },
                              ]
                            : [
                                  { name: 'PUBLIC', tableCount: 2 },
                                  { name: 'MARTS', tableCount: 9 },
                              ],
                    ),
                ),
        );
        renderWithProviders(<Harness />);

        // ANALYTICS (default) validates and auto-picks its largest schema.
        expect(
            await screen.findByDisplayValue('MARTS — 9 tables'),
        ).toBeInTheDocument();

        // Switch database to RAW.
        fireEvent.click(screen.getByRole('textbox', { name: 'Database' }));
        fireEvent.click(
            screen.getByRole('option', { name: /RAW/, hidden: true }),
        );

        // Immediately (debounce + in-flight window): the old schema selection
        // is cleared and the ANALYTICS schema list is no longer shown.
        expect(
            screen.queryByDisplayValue('MARTS — 9 tables'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('textbox', { name: 'Schema' }),
        ).not.toBeInTheDocument();

        // Once RAW's schemas arrive, the largest is auto-picked.
        expect(
            await screen.findByDisplayValue('CORE — 12 tables'),
        ).toBeInTheDocument();
    });

    it('shows the admin-role warning when an admin role is picked and never auto-selects it', async () => {
        mutateAsync.mockResolvedValue(passed(null));
        renderWithProviders(<Harness />);

        // Admin role is not auto-selected even though it is in the inventory.
        expect(
            screen.queryByText(/far more access than Lightdash needs/i),
        ).not.toBeInTheDocument();

        const roleInput = screen.getByRole('textbox', { name: 'Role' });
        fireEvent.click(roleInput);
        fireEvent.click(
            screen.getByRole('option', { name: /ACCOUNTADMIN/, hidden: true }),
        );

        expect(
            await screen.findByText(/far more access than Lightdash needs/i),
        ).toBeInTheDocument();
    });

    it('shows a reconnect affordance when the credential has expired', async () => {
        const onReconnect = vi.fn();
        mutateAsync.mockResolvedValue(authFailed());
        renderWithProviders(<Harness onReconnect={onReconnect} />);

        // db + warehouse preselected → validation fires → authenticate fails.
        const reconnect = await screen.findByRole('button', {
            name: /Reconnect with a new code/,
        });
        expect(
            screen.getByText('Your Snowflake connection has expired'),
        ).toBeInTheDocument();

        fireEvent.click(reconnect);
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('stops auto-validating once the credential is known to be dead', async () => {
        mutateAsync.mockResolvedValue(authFailed());
        renderWithProviders(<Harness />);

        await screen.findByRole('button', {
            name: /Reconnect with a new code/,
        });
        const callsAfterExpiry = mutateAsync.mock.calls.length;

        // Changing a selection would normally trigger a debounced re-validate.
        const roleInput = screen.getByRole('textbox', { name: 'Role' });
        fireEvent.click(roleInput);
        fireEvent.click(
            screen.getByRole('option', { name: /READER/, hidden: true }),
        );
        // Wait past the debounce window; no new validation should have fired.
        await new Promise((resolve) => {
            setTimeout(resolve, VALIDATION_DEBOUNCE_WAIT_MS);
        });
        expect(mutateAsync.mock.calls.length).toBe(callsAfterExpiry);
    });

    it('ignores a stale validation response that resolves out of order', async () => {
        const deferreds: Array<{
            resolve: (v: OnboardingConnectionValidationResult) => void;
        }> = [];
        mutateAsync.mockImplementation(
            () =>
                new Promise<OnboardingConnectionValidationResult>((resolve) => {
                    deferreds.push({ resolve });
                }),
        );
        renderWithProviders(<Harness />);

        // Validation #1 fires from the preselected db + warehouse.
        await waitFor(() => expect(deferreds).toHaveLength(1));

        // Change the role -> validation #2 fires.
        const roleInput = screen.getByRole('textbox', { name: 'Role' });
        fireEvent.click(roleInput);
        fireEvent.click(
            screen.getByRole('option', { name: /READER/, hidden: true }),
        );
        await waitFor(() => expect(deferreds).toHaveLength(2));

        // Resolve #2 (latest) first, then #1 (stale).
        deferreds[1].resolve(passed([{ name: 'FRESH', tableCount: 4 }]));
        await screen.findByDisplayValue('FRESH — 4 tables');

        deferreds[0].resolve(passed([{ name: 'STALE', tableCount: 8 }]));
        // The stale response must not replace the fresh schema selection.
        await waitFor(() =>
            expect(
                screen.queryByDisplayValue('STALE — 8 tables'),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByDisplayValue('FRESH — 4 tables'),
        ).toBeInTheDocument();
    });
});
