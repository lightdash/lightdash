import {
    createContext,
    useContext,
    type ComponentPropsWithoutRef,
    type ForwardRefExoticComponent,
    type ReactNode,
    type RefAttributes,
} from 'react';

export type NavMenuTriggerProps = Omit<
    ComponentPropsWithoutRef<'button'>,
    'onChange'
> & {
    icon: ReactNode;
    label: string;
    hasIndicator: boolean;
    /** Drawn over the icon, for a count the control's owner renders itself. */
    badge: ReactNode | null;
    variant: 'row' | 'icon';
};

type NavMenuTrigger = ForwardRefExoticComponent<
    NavMenuTriggerProps & RefAttributes<HTMLButtonElement>
>;

/** Set by a layout that draws the navbar's menus with its own controls. */
export const NavMenuTriggerContext = createContext<NavMenuTrigger | null>(null);

export const useNavMenuTrigger = () => useContext(NavMenuTriggerContext);
