import { Button, MantineProvider, Menu } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    MOBILE_NAVIGATION_PORTAL_TARGET,
    NavBarPortalContext,
    revealInlineNavMenuOnToggle,
    useNavBarMenuProps,
} from './NavBarPortalContext';

const TestMenu = () => {
    const menuProps = useNavBarMenuProps();

    return (
        <Menu {...menuProps}>
            <Menu.Target>
                <Button>Settings</Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item>Project settings</Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

describe('NavBarPortalContext', () => {
    it('renders compact navigation menus inline with their trigger', async () => {
        render(
            <MantineProvider env="test">
                <div
                    data-testid="mobile-navigation"
                    onClick={revealInlineNavMenuOnToggle}
                >
                    <NavBarPortalContext.Provider
                        value={MOBILE_NAVIGATION_PORTAL_TARGET}
                    >
                        <TestMenu />
                    </NavBarPortalContext.Provider>
                </div>
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

        const dropdown = await screen.findByRole('menu');
        expect(screen.getByTestId('mobile-navigation')).toContainElement(
            dropdown,
        );
        expect(dropdown.previousElementSibling).toHaveTextContent('Settings');
    });

    it('reveals an inline dropdown after its trigger opens', async () => {
        const scrollIntoView = vi.fn();
        const frameCallbacks: FrameRequestCallback[] = [];
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (callback) => {
                frameCallbacks.push(callback);
                return frameCallbacks.length;
            },
        );

        render(
            <MantineProvider env="test">
                <div onClick={revealInlineNavMenuOnToggle}>
                    <NavBarPortalContext.Provider
                        value={MOBILE_NAVIGATION_PORTAL_TARGET}
                    >
                        <TestMenu />
                    </NavBarPortalContext.Provider>
                </div>
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

        await screen.findByRole('menu');
        frameCallbacks.forEach((callback) => callback(0));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    });
});
