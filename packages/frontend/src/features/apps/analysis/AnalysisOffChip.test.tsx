import { type LightdashUserWithAbilityRules } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AnalysisOffChip from './AnalysisOffChip';

const render = (
    reason: 'org_setting_off' | 'copilot_off' | 'not_rolled_out',
    abilityRules: LightdashUserWithAbilityRules['abilityRules'] = [],
) =>
    renderWithProviders(
        <MemoryRouter>
            <AnalysisOffChip reason={reason} />
        </MemoryRouter>,
        { user: { abilityRules } },
    );

// The mocked user query resolves a tick after first render.
const userLoaded = () =>
    act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });

describe('AnalysisOffChip', () => {
    it('links an org admin to the toggle', async () => {
        render('org_setting_off', [
            { action: 'manage', subject: 'Organization' },
        ]);
        const chip = await screen.findByRole('link', {
            name: 'AI analysis off',
        });
        expect(chip).toHaveAttribute(
            'href',
            '/generalSettings/dataApps/aiAnalysis',
        );
    });

    it('is inert for everyone else', async () => {
        render('org_setting_off');
        await screen.findByTestId('analysis-off-chip');
        await userLoaded();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
