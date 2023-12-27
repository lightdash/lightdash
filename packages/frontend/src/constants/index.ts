import { ButtonProps, MantineSize, PopoverProps } from '@mantine/core';

export const FOOTER_HEIGHT = 80;
export const FOOTER_MARGIN: MantineSize = 'lg';

export const COLLAPSABLE_CARD_BUTTON_PROPS: Omit<ButtonProps, 'children'> = {
    variant: 'default',
    size: 'xs',
};

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
