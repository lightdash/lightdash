import { Menu } from '@mantine-8/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import LargeMenuItem from './LargeMenuItem';

// Mock icon component
const MockIcon = () => <svg data-testid="mock-icon" />;

// LargeMenuItem uses Menu.Item internally so it requires a Menu context
const renderInMenu = (ui: React.ReactNode) =>
    renderWithProviders(
        <Menu opened>
            <Menu.Dropdown>{ui}</Menu.Dropdown>
        </Menu>,
    );

describe('LargeMenuItem', () => {
    it('renders no badge when neither isBeta nor isExperimental is set', () => {
        renderInMenu(
            <LargeMenuItem
                title="Chart"
                description="Build queries and save them as charts."
                icon={MockIcon}
            />,
        );

        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
        expect(screen.queryByText('Experimental')).not.toBeInTheDocument();
    });

    it('renders a "Beta" badge when isBeta is true', () => {
        renderInMenu(
            <LargeMenuItem
                title="Chart"
                description="Build queries and save them as charts."
                icon={MockIcon}
                isBeta
            />,
        );

        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.queryByText('Experimental')).not.toBeInTheDocument();
    });

    it('renders an "Experimental" badge when isExperimental is true', () => {
        renderInMenu(
            <LargeMenuItem
                title="App"
                description="Build an interactive app powered by your data."
                icon={MockIcon}
                isExperimental
            />,
        );

        expect(screen.getByText('Experimental')).toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
});
