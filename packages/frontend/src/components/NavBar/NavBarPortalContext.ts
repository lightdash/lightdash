import { createContext, useContext, type MouseEvent } from 'react';

export const MOBILE_NAVIGATION_PORTAL_TARGET = '#navbar-navigation-content';

export const NavBarPortalContext = createContext('#navbar-header');

export const useNavBarPortalTarget = () => useContext(NavBarPortalContext);

export const getNavBarMenuProps = (portalTarget: string | null) => {
    const inline = portalTarget === MOBILE_NAVIGATION_PORTAL_TARGET;

    return {
        withinPortal: !inline,
        withArrow: !inline,
        transitionProps: inline ? { duration: 0 } : undefined,
        portalProps: portalTarget ? { target: portalTarget } : undefined,
    };
};

export const useNavBarMenuProps = () =>
    getNavBarMenuProps(useNavBarPortalTarget());

export const revealInlineNavMenuOnToggle = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>('[aria-expanded]');
    if (!trigger) return;

    window.requestAnimationFrame(() => {
        if (trigger.getAttribute('aria-expanded') !== 'true') return;
        const dropdownId = trigger.getAttribute('aria-controls');
        if (!dropdownId) return;
        document
            .getElementById(dropdownId)
            ?.scrollIntoView?.({ block: 'nearest' });
    });
};
