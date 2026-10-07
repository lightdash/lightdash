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
vi.mock('./AiPrincipals', () => ({ Principals: () => null }));
vi.mock('./AiMarkerTest', () => ({ AiMarkerTest: () => null }));
vi.mock('./AiSetupScriptDrawer', () => ({ AiSetupScriptDrawer: () => null }));
const capabilities: AiWarehouseCapabilities = {
    warehouseType: WarehouseTypes.POSTGRES,
    marker: {
        level: AiAgentMarkerLevel.ADVISORY_SESSION,
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
    it('confirms before switching to marked person', () => {
        renderSettings(policy);
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Switch back to marked person',
            }),
        );
        expect(mutate).not.toHaveBeenCalled();
        expect(
            screen.getByText('Switch to marked person?'),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({
                enabled: true,
                principalKind: AiPrincipalKind.PERSON,
                transport: { kind: AiTransportKind.DIRECT },
                groupMappings: [],
                sharedRef: null,
                twinNameTemplate: null,
            }),
            expect.any(Object),
        );
    });
    it('keeps the saved configuration when the confirmation is cancelled', () => {
        renderSettings(policy);
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Switch back to marked person',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByLabelText('Principal reference')).toHaveValue('');
        expect(mutate).not.toHaveBeenCalled();
    });
    it.each([
        { ...policy, groupMappings: [], sharedRef: 'ai_shared' },
        { ...policy, groupMappings: [], twinNameTemplate: 'ai_{user_uuid}' },
    ])('confirms removal of a shared reference or person template', (saved) => {
        renderSettings(saved);
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Switch back to marked person',
            }),
        );
        expect(
            screen.getByText('Switch to marked person?'),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });
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
    ])('starts collapsed for a person policy or no policy', (saved) => {
        renderSettings(saved);
        expect(
            screen.getByText('Agents run as the marked person'),
        ).toBeInTheDocument();
        expect(
            screen.queryByLabelText('Principal reference'),
        ).not.toBeInTheDocument();
        const disclosure = screen.getByRole('button', {
            name: 'Need a hard boundary? Use a separate principal',
        });
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(disclosure);
        expect(
            screen.getByLabelText('Principal reference'),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });
    it('shows only the marked person statement for verified sessions even when shared is available', () => {
        renderSettings(null, {
            ...capabilities,
            marker: {
                ...capabilities.marker,
                level: AiAgentMarkerLevel.VERIFIED_SESSION,
            },
        });
        expect(
            screen.getByText(
                'Snowflake verifies the session once the person has done the AI sign-in.',
            ),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('heading', { name: 'Identity' }).parentElement!
                    .parentElement!,
            ).queryByRole('button'),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
    it.each([
        AiAgentMarkerLevel.ADVISORY_SESSION,
        AiAgentMarkerLevel.IDENTIFY_ONLY,
    ])('shows the coming-soon reason without controls for %s', (level) => {
        renderSettings(null, {
            ...capabilities,
            marker: { ...capabilities.marker, level },
            principals: {
                ...capabilities.principals,
                shared: {
                    available: false,
                    reason: 'Separate principals are coming soon.',
                },
            },
        });
        expect(
            screen.getByText('Separate principals are coming soon.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                level === AiAgentMarkerLevel.IDENTIFY_ONLY
                    ? 'The marker identifies agent queries in query history. It cannot restrict them.'
                    : 'The marker is advisory on this warehouse. Any SQL in the session can change it.',
            ),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('heading', { name: 'Identity' }).parentElement!
                    .parentElement!,
            ).queryByRole('button'),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
    it.each([
        AiAgentMarkerLevel.VERIFIED_SESSION,
        AiAgentMarkerLevel.IDENTIFY_ONLY,
        AiAgentMarkerLevel.ADVISORY_SESSION,
    ])(
        'confirms switching an API policy on a person-only warehouse at %s',
        (level) => {
            renderSettings(policy, {
                ...capabilities,
                marker: { ...capabilities.marker, level },
                principals: {
                    ...capabilities.principals,
                    shared: { available: false, reason: 'Coming soon' },
                },
            });
            expect(
                screen.getByText(
                    'This connection has a separate principal policy saved through the API.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.queryByLabelText('Principal reference'),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Switch to marked person' }),
            );
            expect(mutate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
            expect(mutate).toHaveBeenCalledWith(
                expect.objectContaining({
                    principalKind: AiPrincipalKind.PERSON,
                    groupMappings: [],
                    sharedRef: null,
                    twinNameTemplate: null,
                }),
                expect.any(Object),
            );
        },
    );
    it('shows the dotted message without Identity controls or Test for no marker', () => {
        renderSettings(policy, {
            ...capabilities,
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
