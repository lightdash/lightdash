import {
    BigqueryAuthenticationType,
    FEATURE_NOT_ENABLED_CODE,
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type ApiError,
    type CreateBigqueryCredentials,
    type Project,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { unusedDbtFormValues } from '../connectionFormDefaults';
import ProjectFormContext from '../context';
import { FormProvider, useForm, type Form } from '../formContext';
import BigQueryForm from './BigQueryForm';
import { BigQueryDefaultValues } from './defaultValues';

vi.mock('../../../hooks/useBigquerySSO', () => ({
    useIsBigQueryAuthenticated: () => ({ data: undefined, error: null }),
    useBigqueryDatasets: () => ({}),
    useBigqueryProjects: () => ({}),
    useBigqueryProjectRecommendation: () => ({}),
}));
vi.mock('../../../hooks/gdrive/useGdrive', () => ({
    useGoogleLoginPopup: () => ({ mutate: vi.fn() }),
}));
vi.mock('./DataTimezoneField', () => ({ default: () => null }));
vi.mock('../Inputs/StartOfWeekSelect', () => ({ default: () => null }));

const api = 'http://test.lightdash';
const identityPath = '/api/v1/bigquery/workload-identity';
const projectUuid = '11111111-1111-4111-8111-111111111111';
const provider =
    'projects/123456/locations/global/workloadIdentityPools/pool-id/providers/provider-id';
const identity = {
    issuer: 'https://accounts.google.com',
    subject: '123456789',
};
const wifCredentials: CreateBigqueryCredentials = {
    ...BigQueryDefaultValues,
    authenticationType: BigqueryAuthenticationType.WORKLOAD_IDENTITY_FEDERATION,
    workloadIdentityProvider: provider,
    workloadIdentityAudience: 'saved-audience',
    keyfileContents: {},
};

const renderForm = ({
    enabled = true,
    saved = false,
    extraConnection = false,
    disabled = false,
    warehouse = BigQueryDefaultValues,
    mockFlag = (request) =>
        request.reply(200, { status: 'ok', results: { enabled } }),
}: {
    enabled?: boolean;
    saved?: boolean;
    extraConnection?: boolean;
    disabled?: boolean;
    warehouse?: CreateBigqueryCredentials;
    mockFlag?: (request: nock.Interceptor) => nock.Scope;
} = {}) => {
    const flag = mockFlag(
        nock(api).get(
            `/api/v2/feature-flag/${FeatureFlags.BigqueryWorkloadIdentityAuth}`,
        ),
    );
    const formRef: { current: Form | null } = { current: null };
    const savedProject: Project = {
        ...unusedDbtFormValues,
        dbtConnection: unusedDbtFormValues.dbt,
        organizationUuid: 'organization',
        projectUuid,
        name: 'Test project',
        type: ProjectType.DEFAULT,
        warehouseConnection: warehouse,
        schedulerTimezone: 'UTC',
        queryTimezone: null,
        useProjectTimezoneInFilters: false,
        schedulerFailureNotifyRecipients: false,
        schedulerFailureIncludeContact: false,
        schedulerFailureContactOverride: null,
        createdByUserUuid: null,
        hasDefaultUserSpaces: false,
        colorPaletteUuid: null,
        expiresAt: null,
        agentSqlScope: null,
    };
    const Wrapper = () => {
        const form = useForm({
            initialValues: {
                name: 'Test project',
                ...unusedDbtFormValues,
                warehouse,
            },
        });
        formRef.current = form;
        return (
            <MemoryRouter>
                <ProjectFormContext.Provider
                    value={{
                        savedProject: saved ? savedProject : undefined,
                        projectUuid: extraConnection ? projectUuid : undefined,
                    }}
                >
                    <FormProvider form={form}>
                        <BigQueryForm disabled={disabled} />
                    </FormProvider>
                </ProjectFormContext.Provider>
            </MemoryRouter>
        );
    };
    return { ...renderWithProviders(<Wrapper />), formRef, flag };
};

const openAuthenticationTypes = async () => {
    await userEvent.click(
        screen.getByRole('combobox', { name: /^Authentication Type/ }),
    );
};

const getWarehouse = (formRef: { current: Form | null }) => {
    const warehouse = formRef.current?.values.warehouse;
    if (warehouse?.type !== WarehouseTypes.BIGQUERY) {
        throw new Error('Expected a BigQuery form');
    }
    return warehouse;
};

const errorResponse = (statusCode: number, code: string): ApiError => ({
    status: 'error',
    error: {
        name: 'ForbiddenError',
        statusCode,
        message: 'Unavailable',
        data: { code },
    },
});

describe('BigQuery workload identity form', () => {
    beforeEach(() => {
        nock(api)
            .get(`/api/v2/feature-flag/${FeatureFlags.NewOnboarding}`)
            .reply(200, { status: 'ok', results: { enabled: false } });
    });

    it.each([false, true])(
        'skips the identity request when the flag is off (saved: %s)',
        async (saved) => {
            const readIdentity = vi.fn(() => ({
                status: 'ok',
                results: identity,
            }));
            nock(api)
                .get(identityPath)
                .query(true)
                .optionally()
                .reply(200, readIdentity);
            const warehouse = saved ? wifCredentials : BigQueryDefaultValues;
            const { flag, formRef } = renderForm({
                enabled: false,
                saved,
                warehouse,
            });
            await waitFor(() => expect(flag.isDone()).toBe(true));
            await openAuthenticationTypes();
            expect(
                screen.queryByRole('option', {
                    name: 'Workload Identity Federation',
                }),
            ).not.toBeInTheDocument();
            expect(readIdentity).not.toHaveBeenCalled();
            expect(formRef.current?.values.warehouse).toEqual(warehouse);
            if (saved) {
                expect(
                    await screen.findByText(
                        /Workload Identity Federation is unavailable/,
                    ),
                ).toBeInTheDocument();
                expect(
                    screen.getByRole('combobox', {
                        name: /^Authentication Type/,
                    }),
                ).toHaveAttribute(
                    'placeholder',
                    'Workload Identity Federation (unavailable)',
                );
                expect(
                    screen.getByLabelText(/Workload identity provider/),
                ).toHaveValue(provider);
                expect(
                    screen.getByLabelText(/Workload identity provider/),
                ).toHaveAttribute('readonly');
                expect(screen.getByLabelText('Audience override')).toHaveValue(
                    'saved-audience',
                );
                expect(
                    screen.getByLabelText('Audience override'),
                ).toHaveAttribute('readonly');
            }
        },
    );

    it.each([false, true])(
        'hides the option on an organization flag refusal (saved: %s)',
        async (saved) => {
            const request = nock(api)
                .get(identityPath)
                .query(saved ? { projectUuid } : {})
                .reply(403, errorResponse(403, FEATURE_NOT_ENABLED_CODE));
            renderForm({
                saved,
                warehouse: saved ? wifCredentials : BigQueryDefaultValues,
            });
            await waitFor(() => expect(request.isDone()).toBe(true));
            await openAuthenticationTypes();
            expect(
                screen.queryByRole('option', {
                    name: 'Workload Identity Federation',
                }),
            ).not.toBeInTheDocument();
            if (saved) {
                expect(
                    await screen.findByText(
                        /Workload Identity Federation is unavailable/,
                    ),
                ).toBeInTheDocument();
                expect(
                    screen.getByLabelText(/Workload identity provider/),
                ).toHaveAttribute('readonly');
            }
        },
    );

    it.each([403, 500])(
        'only shows a disabled option and inline error for existing WIF on HTTP %s',
        async (statusCode) => {
            nock(api)
                .get(identityPath)
                .query({ projectUuid })
                .reply(statusCode, errorResponse(statusCode, 'unavailable'));
            const { formRef } = renderForm({
                saved: true,
                warehouse: wifCredentials,
            });
            expect(
                await screen.findByText(/Couldn't load the instance identity/),
            ).toBeInTheDocument();
            await openAuthenticationTypes();
            expect(
                screen.getByRole('option', {
                    name: 'Workload Identity Federation',
                }),
            ).toHaveAttribute('data-combobox-disabled');
            expect(
                screen.getByLabelText(/Workload identity provider/),
            ).toHaveAttribute('readonly');
            expect(formRef.current?.values.warehouse).toEqual(wifCredentials);
        },
    );

    it('hides the option without an inline error for a new connection on permission denial', async () => {
        const request = nock(api)
            .get(identityPath)
            .reply(403, errorResponse(403, 'unavailable'));
        renderForm();
        await waitFor(() => expect(request.isDone()).toBe(true));
        await openAuthenticationTypes();
        expect(
            screen.queryByRole('option', {
                name: 'Workload Identity Federation',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Couldn't load the instance identity/),
        ).not.toBeInTheDocument();
    });

    it('keeps saved settings on a network failure and recovers on retry', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .replyWithError('Connection reset');
        const { formRef } = renderForm({
            saved: true,
            warehouse: wifCredentials,
        });
        expect(
            await screen.findByText(/Couldn't load the instance identity/),
        ).toBeInTheDocument();
        expect(getWarehouse(formRef)).toEqual(wifCredentials);
        expect(screen.getByLabelText('Audience override')).toHaveAttribute(
            'readonly',
        );
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        expect(screen.getByLabelText('Audience override')).not.toHaveAttribute(
            'readonly',
        );
        expect(getWarehouse(formRef)).toEqual(wifCredentials);
    });

    it('clears an uploaded key when selecting WIF', async () => {
        const user = userEvent.setup();
        nock(api)
            .get(identityPath)
            .reply(200, { status: 'ok', results: identity });
        const { formRef } = renderForm({
            warehouse: {
                ...BigQueryDefaultValues,
                keyfileContents: { private_key: 'test-key' },
            },
        });
        await openAuthenticationTypes();
        await user.click(
            await screen.findByRole('option', {
                name: 'Workload Identity Federation',
            }),
        );
        expect(getWarehouse(formRef).keyfileContents).toEqual({});
        expect(screen.queryByLabelText(/Key File/)).not.toBeInTheDocument();
    });

    it('shows the instance setup values and copies the subject condition', async () => {
        const user = userEvent.setup();
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        renderForm({
            saved: true,
            warehouse: {
                ...wifCredentials,
                workloadIdentityAudience: undefined,
            },
        });
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        expect(screen.getByLabelText('Issuer')).toHaveValue(identity.issuer);
        expect(screen.getByLabelText('Audience')).toHaveValue(
            `https://iam.googleapis.com/${provider}`,
        );
        expect(screen.getByLabelText('Attribute condition')).toHaveValue(
            `assertion.sub == '${identity.subject}'`,
        );
        await user.click(
            screen.getByRole('button', { name: 'Copy attribute condition' }),
        );
        await expect(navigator.clipboard.readText()).resolves.toBe(
            `assertion.sub == '${identity.subject}'`,
        );
    });

    it('trims the audience override, displays it for copying, and restores the default when cleared', async () => {
        const user = userEvent.setup();
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        const { formRef } = renderForm({
            saved: true,
            warehouse: wifCredentials,
        });
        await waitFor(() =>
            expect(screen.getByLabelText('Audience')).toHaveValue(
                'saved-audience',
            ),
        );
        fireEvent.change(screen.getByLabelText('Audience override'), {
            target: { value: '  custom\n' },
        });
        expect(getWarehouse(formRef).workloadIdentityAudience).toBe('custom');
        expect(screen.getByLabelText('Audience')).toHaveValue('custom');
        await user.click(screen.getByRole('button', { name: 'Copy audience' }));
        await expect(navigator.clipboard.readText()).resolves.toBe('custom');
        fireEvent.change(screen.getByLabelText('Audience override'), {
            target: { value: '  ' },
        });
        expect(formRef.current?.values.warehouse).toMatchObject({
            workloadIdentityAudience: undefined,
            workloadIdentityProvider: provider,
            keyfileContents: {},
        });
        expect(screen.getByLabelText('Audience')).toHaveValue(
            `https://iam.googleapis.com/${provider}`,
        );
    });

    it('trims the provider, clears empty input, and withholds the derived audience for an invalid provider', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        const { formRef } = renderForm({
            saved: true,
            warehouse: {
                ...wifCredentials,
                workloadIdentityAudience: undefined,
            },
        });
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        const providerInput = screen.getByLabelText(
            /Workload identity provider/,
        );
        fireEvent.change(providerInput, {
            target: { value: `  ${provider}\n` },
        });
        expect(getWarehouse(formRef).workloadIdentityProvider).toBe(provider);
        expect(screen.getByLabelText('Audience')).toHaveValue(
            `https://iam.googleapis.com/${provider}`,
        );
        fireEvent.change(providerInput, { target: { value: 'invalid' } });
        expect(screen.getByLabelText('Audience')).toHaveValue('');
        expect(
            screen.queryByRole('button', { name: 'Copy audience' }),
        ).not.toBeInTheDocument();
        fireEvent.change(providerInput, { target: { value: '  ' } });
        expect(getWarehouse(formRef).workloadIdentityProvider).toBeUndefined();
        expect(providerInput).toHaveValue('');
    });

    it('clears both federation fields and resets the key input when leaving WIF', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        const { formRef } = renderForm({
            saved: true,
            warehouse: wifCredentials,
        });
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        await openAuthenticationTypes();
        await userEvent.click(
            screen.getByRole('option', {
                name: 'Service Account (JSON key file)',
            }),
        );
        expect(getWarehouse(formRef).keyfileContents).toBe('');
        expect(getWarehouse(formRef).workloadIdentityProvider).toBeUndefined();
        expect(getWarehouse(formRef).workloadIdentityAudience).toBeUndefined();
        expect(screen.getByLabelText(/Key File/)).toBeInTheDocument();
    });

    it('waits for the identity endpoint before offering WIF', async () => {
        const pending = Promise.withResolvers<typeof identity>();
        const readIdentity = vi.fn(() => pending.promise);
        nock(api)
            .get(identityPath)
            .reply(200, async () => ({
                status: 'ok',
                results: await readIdentity(),
            }));
        renderForm();
        await waitFor(() => expect(readIdentity).toHaveBeenCalled());
        await openAuthenticationTypes();
        expect(
            screen.queryByRole('option', {
                name: 'Workload Identity Federation',
            }),
        ).not.toBeInTheDocument();
        pending.resolve(identity);
        expect(
            await screen.findByRole('option', {
                name: 'Workload Identity Federation',
            }),
        ).not.toHaveAttribute('data-combobox-disabled');
    });

    it('keeps the saved type visible and disabled while the flag and identity load', async () => {
        const pendingFlag = Promise.withResolvers<boolean>();
        const pendingIdentity = Promise.withResolvers<typeof identity>();
        const readIdentity = vi.fn(() => pendingIdentity.promise);
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, async () => ({
                status: 'ok',
                results: await readIdentity(),
            }));
        renderForm({
            saved: true,
            warehouse: wifCredentials,
            mockFlag: (request) =>
                request.reply(200, async () => ({
                    status: 'ok',
                    results: { enabled: await pendingFlag.promise },
                })),
        });
        const authentication = screen.getByRole('combobox', {
            name: /^Authentication Type/,
        });
        expect(authentication).toHaveValue('Workload Identity Federation');
        expect(authentication).not.toHaveAttribute('placeholder');
        await openAuthenticationTypes();
        expect(
            screen.getByRole('option', {
                name: 'Workload Identity Federation',
            }),
        ).toHaveAttribute('data-combobox-disabled');
        pendingFlag.resolve(true);
        await waitFor(() => expect(readIdentity).toHaveBeenCalled());
        expect(authentication).toHaveValue('Workload Identity Federation');
        expect(
            screen.getByRole('option', {
                name: 'Workload Identity Federation',
            }),
        ).toHaveAttribute('data-combobox-disabled');
        pendingIdentity.resolve(identity);
        await waitFor(() =>
            expect(
                screen.getByRole('option', {
                    name: 'Workload Identity Federation',
                }),
            ).not.toHaveAttribute('data-combobox-disabled'),
        );
    });

    it('preserves saved values when the flag fetch fails and recovers on retry', async () => {
        const { formRef } = renderForm({
            saved: true,
            warehouse: wifCredentials,
            mockFlag: (request) =>
                request.reply(500, errorResponse(500, 'unavailable')),
        });
        expect(
            await screen.findByText(
                /Couldn't check Workload Identity Federation availability/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Couldn't load the instance identity/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByLabelText(/Workload identity provider/),
        ).toHaveAttribute('readonly');
        expect(getWarehouse(formRef)).toEqual(wifCredentials);
        nock(api)
            .get(
                `/api/v2/feature-flag/${FeatureFlags.BigqueryWorkloadIdentityAuth}`,
            )
            .reply(200, { status: 'ok', results: { enabled: true } });
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        expect(
            screen.getByLabelText(/Workload identity provider/),
        ).not.toHaveAttribute('readonly');
        expect(getWarehouse(formRef)).toEqual(wifCredentials);
    });

    it('passes the parent project UUID for an extra connection and preserves saved values', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        const { formRef } = renderForm({
            extraConnection: true,
            warehouse: wifCredentials,
        });
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        expect(formRef.current?.values.warehouse).toEqual(wifCredentials);
        expect(
            screen.getByLabelText(/Workload identity provider/),
        ).not.toHaveAttribute('readonly');
    });

    it('warns when the subject is unavailable without offering a placeholder condition to copy', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, {
                status: 'ok',
                results: { ...identity, subject: null },
            });
        renderForm({ saved: true, warehouse: wifCredentials });
        expect(
            await screen.findByText(/subject is unavailable/),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Issuer')).toHaveValue(identity.issuer);
        expect(screen.getByLabelText('Attribute condition')).toHaveValue('');
        expect(
            screen.queryByRole('button', { name: 'Copy attribute condition' }),
        ).not.toBeInTheDocument();
    });

    it('disables identity inputs when the surrounding form is disabled', async () => {
        nock(api)
            .get(identityPath)
            .query({ projectUuid })
            .reply(200, { status: 'ok', results: identity });
        renderForm({ saved: true, warehouse: wifCredentials, disabled: true });
        await waitFor(() =>
            expect(screen.getByLabelText('Subject')).toHaveValue(
                identity.subject,
            ),
        );
        expect(
            screen.getByLabelText(/Workload identity provider/),
        ).toBeDisabled();
        expect(screen.getByLabelText('Audience override')).toBeDisabled();
    });
});
