import { type LightdashUserWithAbilityRules } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { MetricsLink } from './MetricsLink';

const projectUuid = 'project-1';

const renderMetricsLink = (
    abilityRules: LightdashUserWithAbilityRules['abilityRules'],
) =>
    renderWithProviders(
        <MemoryRouter>
            <MetricsLink projectUuid={projectUuid} />
        </MemoryRouter>,
        { user: { abilityRules } },
    );

describe('MetricsLink', () => {
    it('hides the metrics link when the user cannot view metrics features', () => {
        renderMetricsLink([{ action: 'view', subject: 'Project' }]);

        expect(
            screen.queryByRole('button', { name: 'Metrics' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        { action: 'view' as const, subject: 'MetricsTree' as const },
        {
            action: 'manage' as const,
            subject: 'SpotlightTableConfig' as const,
        },
    ])('shows the metrics link with $action:$subject access', async (rule) => {
        renderMetricsLink([
            {
                ...rule,
                conditions: { projectUuid },
            },
        ]);

        expect(
            await screen.findByRole('button', { name: 'Metrics' }),
        ).toBeInTheDocument();
    });
});
