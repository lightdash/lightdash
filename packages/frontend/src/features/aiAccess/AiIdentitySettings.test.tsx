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
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentitySettings } from './AiIdentitySettings';
const mutate = vi.fn();
vi.mock('./api', () => ({
    useUpsertAiAccessPolicy: () => ({ mutate, isLoading: false }),
}));
vi.mock('./AiPrincipals', () => ({ Principals: () => null }));
vi.mock('./AiMarkerTest', () => ({ AiMarkerTest: () => null }));
vi.mock('./AiPolicyEditor', () => ({ AiPolicyEditor: () => null }));
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
const renderSettings = (saved: AiAccessPolicy | null) =>
    renderWithProviders(
        <AiIdentitySettings
            projectUuid="project"
            connection={null}
            connectionSelector={null}
            policy={saved}
            capabilities={capabilities}
        />,
    );
describe('Agent identity draft', () => {
    beforeEach(() => mutate.mockClear());
    it('does not save a radio change and confirms removal on Save', () => {
        renderSettings(policy);
        fireEvent.click(screen.getByRole('radio', { name: 'Marked person' }));
        expect(mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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
        fireEvent.click(screen.getByRole('radio', { name: 'Marked person' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(
            screen.getByRole('radio', { name: 'Separate principal' }),
        );
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(mutate).not.toHaveBeenCalled();
    });
    it.each([
        { ...policy, groupMappings: [], sharedRef: 'ai_shared' },
        { ...policy, groupMappings: [], twinNameTemplate: 'ai_{user_uuid}' },
    ])('confirms removal of a shared reference or person template', (saved) => {
        renderSettings(saved);
        fireEvent.click(screen.getByRole('radio', { name: 'Marked person' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(
            screen.getByText('Switch to marked person?'),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });
    it('leaves marked person without a saved policy unconfigured', () => {
        renderSettings(null);
        fireEvent.click(
            screen.getByRole('radio', { name: 'Separate principal' }),
        );
        fireEvent.click(screen.getByRole('radio', { name: 'Marked person' }));
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(mutate).not.toHaveBeenCalled();
    });
});
