import { MantineProvider } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { type SettingsNavigationSection } from '../../hooks/settings/types';
import SettingsNavigation from './SettingsNavigation';

const base = '/generalSettings/projectManagement/project';
const sections: SettingsNavigationSection[] = [
    {
        id: 'current-project',
        title: 'Current project',
        subtitle: 'Project',
        items: [
            {
                label: 'Agent settings',
                to: `${base}/agentSettings`,
                icon: IconSparkles,
                keywords: ['ai', 'agent'],
                children: [
                    ['Agent data scope', 'agentDataScope'],
                    ['AI region', 'aiRegion'],
                    ['Agent identity', 'aiAccess'],
                ].map(([label, path]) => ({
                    label,
                    to: `${base}/${path}`,
                    icon: IconSparkles,
                    keywords: [],
                    children: [],
                    exact: true,
                })),
            },
        ],
    },
];

const renderNavigation = (path: string, searchQuery = '') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <Link to={`${base}/aiAccess`}>Open identity</Link>
                <SettingsNavigation
                    sections={sections}
                    searchQuery={searchQuery}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('SettingsNavigation groups', () => {
    it.each(['agentDataScope', 'aiRegion', 'aiAccess', 'agentSettings'])(
        'opens the group at %s',
        (page) => {
            renderNavigation(`${base}/${page}`);
            expect(
                screen.getByRole('link', { name: 'Agent settings' }),
            ).toHaveAttribute('data-expanded', 'true');
        },
    );

    it('opens the group when navigating to a child after mount', () => {
        renderNavigation(`${base}/settings`);
        expect(
            screen.getByRole('link', { name: 'Agent settings' }),
        ).not.toHaveAttribute('data-expanded', 'true');
        fireEvent.click(screen.getByRole('link', { name: 'Open identity' }));
        expect(
            screen.getByRole('link', { name: 'Agent settings' }),
        ).toHaveAttribute('data-expanded', 'true');
    });

    it('opens the group while filtering outside its pages', () => {
        renderNavigation(`${base}/settings`, 'principal');
        expect(
            screen.getByRole('link', { name: 'Agent settings' }),
        ).toHaveAttribute('data-expanded', 'true');
    });
});
