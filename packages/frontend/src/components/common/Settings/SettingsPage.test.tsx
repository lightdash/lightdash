import { Button } from '@mantine-8/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    SettingsPage,
    SettingsPageActions,
    SettingsPageDocumentationLink,
} from './SettingsPage';

describe('SettingsPage', () => {
    it('renders a consistent page heading, description, actions, and content', () => {
        renderWithProviders(
            <SettingsPage
                title="User management"
                description="Manage members and groups."
                actions={<Button>Add user</Button>}
            >
                <div>Settings content</div>
            </SettingsPage>,
        );

        expect(
            screen.getByRole('heading', {
                level: 4,
                name: 'User management',
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Manage members and groups.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Add user' })).toBeVisible();
        expect(screen.getByText('Settings content')).toBeVisible();
    });

    it('does not require a description or actions', () => {
        renderWithProviders(
            <SettingsPage title="Profile">
                <div>Profile content</div>
            </SettingsPage>,
        );

        expect(
            screen.getByRole('heading', { level: 4, name: 'Profile' }),
        ).toBeVisible();
        expect(screen.getByText('Profile content')).toBeVisible();
    });

    it('renders grouped page actions and external documentation links', () => {
        renderWithProviders(
            <SettingsPage
                title="Users"
                actions={
                    <SettingsPageActions>
                        <SettingsPageDocumentationLink href="https://docs.example.com/users" />
                        <Button>Add user</Button>
                    </SettingsPageActions>
                }
            >
                <div>Users content</div>
            </SettingsPage>,
        );

        expect(
            screen.getByRole('link', { name: 'Documentation' }),
        ).toHaveAttribute('href', 'https://docs.example.com/users');
        expect(
            screen.getByRole('link', { name: 'Documentation' }),
        ).toHaveAttribute('target', '_blank');
        expect(screen.getByRole('button', { name: 'Add user' })).toBeVisible();
    });
});
