import { Menu } from '@mantine-8/core';
import { IconAppWindow } from '@tabler/icons-react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import LargeMenuItem from './LargeMenuItem';

describe('LargeMenuItem', () => {
    it('renders isExperimental badge with "Experimental" text instead of "Beta"', () => {
        renderWithProviders(
            <Menu opened>
                <Menu.Dropdown>
                    <LargeMenuItem
                        title="App"
                        description="Build an interactive app powered by your data."
                        icon={IconAppWindow}
                        isExperimental
                    />
                </Menu.Dropdown>
            </Menu>,
        );

        // Should show "Experimental" badge, not "Beta"
        expect(screen.getByText('Experimental')).toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
});
