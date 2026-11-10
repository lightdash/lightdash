import { MantineThemeProvider, type MantineThemeOverride } from '@mantine/core';
import { useMemo, type FC, type PropsWithChildren } from 'react';

// Portalled lists of everything inside get the class, through Mantine's own
// dropdown props, so no shared input needs a prop for it
export const DropdownClass: FC<
    PropsWithChildren<{ className: string | null }>
> = ({ className, children }) => {
    const theme = useMemo<MantineThemeOverride>(
        () => ({
            components: {
                ComboboxDropdown: { defaultProps: { className } },
                PopoverDropdown: { defaultProps: { className } },
            },
        }),
        [className],
    );
    if (className === null) return children;
    return (
        <MantineThemeProvider theme={theme}>{children}</MantineThemeProvider>
    );
};
