import { Menu } from '@mantine-8/core';
import { IconTable } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import LargeMenuItem from './LargeMenuItem';

// LargeMenuItem renders a Mantine Menu.Item which requires a Menu context
const renderInMenu = (ui: React.ReactElement) =>
    renderWithProviders(
        <Menu opened>
            <Menu.Dropdown>{ui}</Menu.Dropdown>
        </Menu>,
    );

describe('LargeMenuItem badge rendering', () => {
    it('renders Beta badge when isBeta is true', () => {
        renderInMenu(
            <LargeMenuItem
                title="Test"
                description="A test item"
                icon={IconTable}
                isBeta
            />,
        );
        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.queryByText('Experimental')).not.toBeInTheDocument();
    });

    it('renders Experimental badge when isExperimental is true', () => {
        renderInMenu(
            <LargeMenuItem
                title="Test"
                description="A test item"
                icon={IconTable}
                isExperimental
            />,
        );
        expect(screen.getByText('Experimental')).toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });

    it('renders neither badge when neither prop is set', () => {
        renderInMenu(
            <LargeMenuItem
                title="Test"
                description="A test item"
                icon={IconTable}
            />,
        );
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
        expect(screen.queryByText('Experimental')).not.toBeInTheDocument();
    });
});
