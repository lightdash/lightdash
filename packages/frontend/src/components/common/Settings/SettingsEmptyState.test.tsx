import { Button } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SettingsEmptyState } from './SettingsEmptyState';

describe('SettingsEmptyState', () => {
    it('renders a compact section heading, description, and action', () => {
        renderWithProviders(
            <SettingsEmptyState
                icon={IconKey}
                title="No tokens"
                description="Create a token to access the API."
            >
                <Button>Create token</Button>
            </SettingsEmptyState>,
        );

        expect(
            screen.getByRole('heading', { level: 5, name: 'No tokens' }),
        ).toBeVisible();
        expect(
            screen.getByText('Create a token to access the API.'),
        ).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Create token' }),
        ).toBeVisible();
    });
});
