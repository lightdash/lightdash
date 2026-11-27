import {
    createContext,
    useContext,
    type ComponentPropsWithoutRef,
    type ForwardRefExoticComponent,
    type ReactNode,
    type RefAttributes,
} from 'react';
import { NavBarMenuTrigger } from './NavBarMenuTrigger';

export type NavMenuTriggerProps = Omit<
    ComponentPropsWithoutRef<'button'>,
    'onChange'
> & {
    icon: ReactNode;
    label: string;
    hasIndicator: boolean;
    /** Drawn over the icon, for a count the control's owner renders itself. */
    badge: ReactNode | null;
    /** A control that stands alone as an icon, or one of a list of rows. */
    variant: 'row' | 'icon';
    /** The top navbar only spells its labels out in the phone drawer. */
    withLabel: boolean;
};

type NavMenuTrigger = ForwardRefExoticComponent<
    NavMenuTriggerProps & RefAttributes<HTMLButtonElement>
>;

type NavLayout = {
    layout: 'navbar' | 'sidebar';
    /** The sidebar folded to its rail; never true in the top navbar. */
    isCollapsed: boolean;
    /** How this layout draws the control that opens one of its menus. */
    Trigger: NavMenuTrigger;
};

/** Which navigation layout the shared menus are being drawn in. */
export const NavLayoutContext = createContext<NavLayout>({
    layout: 'navbar',
    isCollapsed: false,
    Trigger: NavBarMenuTrigger,
});

export const useNavLayout = () => useContext(NavLayoutContext);

// Menus opened from the sidebar's own controls open beside it.
const SIDE_MENU_PROPS = {
    position: 'right-end',
    offset: 8,
    withArrow: false,
} as const;

/** Placement for a menu opened from a `Trigger`, on top of the portal props. */
export const useNavTriggerMenuProps = () =>
    useNavLayout().layout === 'sidebar' ? SIDE_MENU_PROPS : {};
