import {
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalKind,
    AiSetupScriptFormat,
    AiTransportKind,
    WarehouseTypes,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
const mutate = vi.fn();
vi.mock('./api', () => ({
    useUpsertAiAccessPolicy: () => ({ mutate, isLoading: false }),
}));
vi.mock('./AiPrincipals', () => ({
    Principals: () => <div>Principal table</div>,
    PrincipalsEmptyState: () => <div>Principals empty state</div>,
}));
vi.mock('./AiMarkerTest', () => ({
    AiMarkerTest: () => <div>Marker test</div>,
}));
vi.mock('./AiSetupScriptDrawer', () => ({ AiSetupScriptDrawer: () => null }));
const capabilities: AiWarehouseCapabilities = {
    warehouseType: WarehouseTypes.POSTGRES,
    marker: {
        level: AiAgentMarkerLevel.IDENTIFY_ONLY,
        signals: [],
        note: null,
        enforce: null,
    },
    setupFormat: AiSetupScriptFormat.SQL,
    principals: {
        person: { available: true, method: AiCredentialMethod.MARKER },
        group: { available: true, method: AiCredentialMethod.KEY },
        twin: { available: true, method: AiCredentialMethod.KEY },
        shared: { available: true, method: AiCredentialMethod.KEY },
    },
    transports: {
        direct: { available: true },
        procedure: { available: false, reason: 'Unavailable' },
    },
};
const policy: AiAccessPolicy = {
    aiAccessPolicyUuid: 'policy',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    enabled: true,
    principalKind: AiPrincipalKind.GROUP,
    transport: { kind: AiTransportKind.DIRECT },
    sharedRef: null,
    twinNameTemplate: null,
    policySource: null,
    groupMappings: [
        {
            groupUuid: 'group',
            groupName: 'Group',
            ref: 'ai_group',
            priority: 0,
        },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
};
const renderSettings = (
    saved: AiAccessPolicy | null,
    available = capabilities,
) =>
    renderWithProviders(
        <AiIdentitySettings
            projectUuid="project"
            connection={null}
            connectionSelector={null}
            policy={saved}
            capabilities={available}
        />,
    );
describe('Agent identity draft', () => {
    beforeEach(() => mutate.mockClear());
    it.each([AiPrincipalKind.GROUP, AiPrincipalKind.TWIN])(
        'replaces an API-created %s setup with one principal after confirmation',
        (principalKind) => {
            renderSettings({
                ...policy,
                principalKind,
                groupMappings:
                    principalKind === AiPrincipalKind.GROUP
                        ? policy.groupMappings
                        : [],
                twinNameTemplate:
                    principalKind === AiPrincipalKind.TWIN
                        ? 'ai_{user_uuid}'
                        : null,
            });
            expect(screen.getByLabelText('Principal reference')).toHaveValue(
                '',
            );
            expect(
                screen.getByText(/Agents run as a per-group or per-person/),
            ).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
            fireEvent.change(screen.getByLabelText('Principal reference'), {
                target: { value: 'ai_shared' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            expect(
                screen.getByText('Replace principal setup?'),
            ).toBeInTheDocument();
            expect(mutate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(mutate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
            expect(mutate).toHaveBeenCalledWith(
                {
                    enabled: true,
                    principalKind: AiPrincipalKind.SHARED,
                    transport: { kind: AiTransportKind.DIRECT },
                    sharedRef: 'ai_shared',
                    twinNameTemplate: null,
                    groupMappings: [],
                    policySource: null,
                },
                expect.any(Object),
            );
        },
    );
    it('keeps a saved shared reference and saves edits without confirmation', () => {
        renderSettings({
            ...policy,
            principalKind: AiPrincipalKind.SHARED,
            sharedRef: 'ai_shared',
            groupMappings: [],
        });
        expect(screen.getByLabelText('Principal reference')).toHaveValue(
            'ai_shared',
        );
        expect(
            screen.getByText(/Agents run as the separate principal/),
        ).toHaveTextContent('ai_shared');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Switch.*marked person/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Principal table')).toBeInTheDocument();
        expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Principal reference'), {
            target: { value: 'ai_other' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({
                principalKind: AiPrincipalKind.SHARED,
                sharedRef: 'ai_other',
            }),
            expect.any(Object),
        );
    });
    it.each([
        null,
        { ...policy, principalKind: AiPrincipalKind.PERSON, groupMappings: [] },
    ])(
        'shows the principal form and warning without a principal policy',
        (saved) => {
            renderSettings(saved);
            expect(
                screen.getByText(
                    'Agents need a separate principal on this warehouse.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'The marker identifies agent queries here but cannot restrict them.',
                ),
            ).toBeInTheDocument();
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Agents currently run as the person with no restriction.',
            );
            expect(screen.getByLabelText('Principal reference')).toBeEnabled();
            expect(screen.getByText('Transport')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Setup script' }),
            ).toBeEnabled();
            expect(
                screen.queryByText(/Need a hard boundary/),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Switch.*marked person/),
            ).not.toBeInTheDocument();
            expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
            expect(
                screen.getByText('Principals empty state'),
            ).toBeInTheDocument();
            fireEvent.change(screen.getByLabelText('Principal reference'), {
                target: { value: 'ai_shared' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
            expect(mutate).toHaveBeenCalledWith(
                expect.objectContaining({
                    principalKind: AiPrincipalKind.SHARED,
                    sharedRef: 'ai_shared',
                }),
                expect.any(Object),
            );
        },
    );
    it.each([
        AiAgentMarkerLevel.VERIFIED_SESSION,
        AiAgentMarkerLevel.REQUEST_BOUND,
    ])(
        'keeps the marked person and marker test without controls for %s',
        (level) => {
            renderSettings(null, {
                ...capabilities,
                marker: { ...capabilities.marker, level },
            });
            expect(
                screen.getByText('Agents run as the marked person'),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    level === AiAgentMarkerLevel.VERIFIED_SESSION
                        ? 'Snowflake verifies the session once the person has done the AI sign-in.'
                        : "The marker is fixed by the request. Enforcement needs your warehouse's access control plugin or policy to read it.",
                ),
            ).toBeInTheDocument();
            expect(
                within(
                    screen.getByRole('heading', { name: 'Identity' })
                        .parentElement!.parentElement!,
                ).queryByRole('button'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText('Principal reference'),
            ).not.toBeInTheDocument();
            expect(screen.getByText('Marker test')).toBeInTheDocument();
        },
    );
    it.each([
        WarehouseTypes.REDSHIFT,
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.DATABRICKS,
        WarehouseTypes.ATHENA,
        WarehouseTypes.CLICKHOUSE,
    ])(
        'disables the form and explains unavailable shared principals on %s',
        (warehouseType) => {
            renderSettings(null, {
                ...capabilities,
                warehouseType,
                principals: {
                    ...capabilities.principals,
                    shared: {
                        available: false,
                        reason: 'Separate principals are coming soon.',
                    },
                },
            });
            expect(
                screen.getByText(
                    'Agents need a separate principal on this warehouse.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'The marker identifies agent queries here but cannot restrict them.',
                ),
            ).toBeInTheDocument();
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Agents currently run as the person with no restriction.',
            );
            expect(screen.getByLabelText('Principal reference')).toBeDisabled();
            expect(
                screen.getByRole('radio', { name: 'Direct' }),
            ).toBeDisabled();
            expect(
                screen.getByRole('radio', { name: 'Procedure' }),
            ).toBeDisabled();
            expect(
                screen.getByText('Separate principals are coming soon.'),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Save' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Setup script' }),
            ).toBeDisabled();
            expect(screen.queryByText('Marker test')).not.toBeInTheDocument();
            expect(
                screen.getByText('Principals empty state'),
            ).toBeInTheDocument();
        },
    );
    it('shows the dotted message without Identity controls or Test for no marker', () => {
        renderSettings(policy, {
            ...capabilities,
            principals: {
                ...capabilities.principals,
                shared: { available: false, reason: 'Unavailable' },
            },
            marker: { ...capabilities.marker, level: AiAgentMarkerLevel.NONE },
        });
        expect(
            screen.getByText('This warehouse cannot mark agent queries.')
                .parentElement,
        ).toHaveAttribute('data-variant', 'dotted');
        expect(
            within(
                screen.getByRole('heading', { name: 'Identity' }).parentElement!
                    .parentElement!,
            ).queryByRole('button'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Test')).not.toBeInTheDocument();
    });
});
