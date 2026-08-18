import {
    FeatureFlags,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { defaultAbility } from '../../providers/Ability/constants';
import { renderWithProviders } from '../../testing/testUtils';
import ExploreMenu from './ExploreMenu';

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

type AbilityRules = LightdashUserWithAbilityRules['abilityRules'];

const projectUuid = 'project-1';

const exploreRule: AbilityRules[number] = {
    action: 'manage',
    subject: 'Explore',
};

const createDataAppRule: AbilityRules[number] = {
    action: 'create',
    subject: 'DataApp',
};

const setDataAppsFlag = (enabled: boolean) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: FeatureFlags.EnableDataApps, enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);
};

// `Can` reads the module-level `defaultAbility` singleton, which `PrivateRoute`
// updates from the user's ability rules in the real app.
const renderMenu = async (rules: AbilityRules) => {
    defaultAbility.update(rules);
    const result = renderWithProviders(
        <MemoryRouter>
            <ExploreMenu projectUuid={projectUuid} />
        </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('ExploreMenu/NewButton'));
    return result;
};

describe('ExploreMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setDataAppsFlag(true);
        defaultAbility.update([]);
    });

    afterEach(() => {
        defaultAbility.update([]);
    });

    it('links to the chart type builder when data apps are enabled and the user can create a data app', async () => {
        await renderMenu([exploreRule, createDataAppRule]);

        const item = await screen.findByText('Chart type');
        expect(item.closest('a')).toHaveAttribute(
            'href',
            `/projects/${projectUuid}/chart-types/new`,
        );
    });

    it('hides the chart type entry when the data apps flag is off', async () => {
        setDataAppsFlag(false);
        await renderMenu([exploreRule, createDataAppRule]);

        await screen.findByText('Chart');
        expect(screen.queryByText('Chart type')).not.toBeInTheDocument();
    });

    it('hides the chart type entry when the user cannot create a data app', async () => {
        await renderMenu([exploreRule]);

        await screen.findByText('Chart');
        await waitFor(() => {
            expect(screen.queryByText('Chart type')).not.toBeInTheDocument();
        });
    });
});
