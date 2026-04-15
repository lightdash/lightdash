import { Menu } from '@mantine-8/core';
import { IconTable } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import LargeMenuItem from './LargeMenuItem';

// LargeMenuItem renders a Menu.Item which requires a Menu context
const renderInMenu = (ui: React.ReactNode) =>
    renderWithProviders(
        <Menu opened>
            <Menu.Dropdown>{ui}</Menu.Dropdown>
        </Menu>,
    );

describe('LargeMenuItem', () => {
    it('renders "Experimental" badge (red) when isExperimental is true', () => {
        renderInMenu(
            <LargeMenuItem
                icon={IconTable}
                title="App"
                description="Build an interactive app powered by your data."
                isExperimental
            />,
        );

        expect(screen.getByText('Experimental')).toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });

    it('renders no badge when isExperimental is omitted', () => {
        renderInMenu(
            <LargeMenuItem
                icon={IconTable}
                title="App"
                description="Build an interactive app powered by your data."
            />,
        );

        expect(screen.queryByText('Experimental')).not.toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
});
