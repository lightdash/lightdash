import {
    type ActionIconProps,
    type ButtonProps,
    type PopoverProps,
} from '@mantine/core';

export const COLLAPSABLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'default',
    size: 'xs',
};

export const COLLAPSABLE_CARD_ACTION_ICON_PROPS: Pick<
    ActionIconProps,
    'variant' | 'size'
> = {
    ...COLLAPSABLE_CARD_BUTTON_PROPS,
    size: 'md',
};

export const COLLAPSIBLE_CARD_GAP_SIZE = 8;

export const COLLAPSABLE_CARD_POPOVER_PROPS: Omit<PopoverProps, 'children'> = {
    shadow: 'md',
    position: 'bottom',
    withArrow: true,
    closeOnClickOutside: true,
    closeOnEscape: true,
    keepMounted: false,
    arrowSize: 10,
    offset: 2,
};
