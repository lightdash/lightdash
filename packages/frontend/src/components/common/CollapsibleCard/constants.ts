import {
    type ActionIconProps,
    type ButtonProps,
    type PopoverProps,
} from '@mantine-8/core';

export const COLLAPSIBLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'default',
    size: 'xs',
};

export const COLLAPSIBLE_CARD_ACTION_ICON_PROPS: Pick<
    ActionIconProps,
    'variant' | 'size'
> = {
    ...COLLAPSIBLE_CARD_BUTTON_PROPS,
    size: 'md',
};

export const COLLAPSIBLE_CARD_GAP_SIZE = 8;

export const COLLAPSIBLE_CARD_POPOVER_PROPS: Omit<PopoverProps, 'children'> = {
    shadow: 'md',
    position: 'bottom',
    withArrow: true,
    closeOnClickOutside: true,
    closeOnEscape: true,
    keepMounted: false,
    arrowSize: 10,
    offset: 2,
};
