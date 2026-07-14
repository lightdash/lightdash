import { type LightdashUserWithAbilityRules } from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useOnboardingEntryGuard } from './useOnboardingEntryGuard';

type AbilityRules = LightdashUserWithAbilityRules['abilityRules'];

const ORG_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

const mockUseOrganization = vi.fn();
const mockUseProjects = vi.fn();

vi.mock('../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => mockUseOrganization(),
}));

vi.mock('../../../hooks/useProjects', () => ({
    useProjects: () => mockUseProjects(),
}));

describe('useOnboardingEntryGuard', () => {
    beforeEach(() => {
        mockUseOrganization.mockReturnValue({
            data: { organizationUuid: ORG_UUID },
            isInitialLoading: false,
        });
        mockUseProjects.mockReturnValue({
            data: [],
            isInitialLoading: false,
        });
    });

    const canCreateProject = {
        abilityRules: [
            { action: 'create', subject: 'Project' },
        ] as AbilityRules,
    };

    it('allows entry with create ability and zero projects', async () => {
        const { result } = renderHookWithProviders(
            () => useOnboardingEntryGuard(false),
            { user: canCreateProject },
        );
        await waitFor(() => expect(result.current).toBe('allowed'));
    });

    it('redirects when the user cannot create projects', async () => {
        const { result } = renderHookWithProviders(
            () => useOnboardingEntryGuard(false),
            { user: { abilityRules: [] } },
        );
        await waitFor(() => expect(result.current).toBe('redirect'));
    });

    it('redirects when the org already has projects', async () => {
        mockUseProjects.mockReturnValue({
            data: [{ projectUuid: 'existing' }],
            isInitialLoading: false,
        });
        const { result } = renderHookWithProviders(
            () => useOnboardingEntryGuard(false),
            { user: canCreateProject },
        );
        await waitFor(() => expect(result.current).toBe('redirect'));
    });

    it('allows sub-steps (project context) even when projects exist', async () => {
        mockUseProjects.mockReturnValue({
            data: [{ projectUuid: 'existing' }],
            isInitialLoading: false,
        });
        const { result } = renderHookWithProviders(
            () => useOnboardingEntryGuard(true),
            { user: canCreateProject },
        );
        await waitFor(() => expect(result.current).toBe('allowed'));
    });
});
