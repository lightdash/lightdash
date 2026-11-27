import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import MantineBaseProvider from '../../providers/MantineBaseProvider';

const getNavBarRootElement = () =>
    document.getElementById('navbar-header') ?? undefined;

type Props = {
    hasVisibleFixedNavbar: boolean;
    hasBanner: boolean;
    children: ReactNode;
};

// Scoped dark theme using Mantine's cssVariablesSelector + getRootElement.
// This is the recommended approach for scoped theming, though it has known CSS specificity
// limitations (see: https://github.com/orgs/mantinedev/discussions/4803).
// The manual `data-mantine-color-scheme="dark"` attribute helps CSS selectors match correctly.
export const NavBarRoot: FC<Props> = ({
    hasVisibleFixedNavbar,
    hasBanner,
    children,
}) => (
    <Box
        id="navbar-header"
        data-mantine-color-scheme="dark"
        data-has-visible-fixed-navbar={hasVisibleFixedNavbar}
        data-has-banner={hasBanner}
    >
        <MantineBaseProvider
            forceColorScheme="dark"
            cssVariablesSelector="#navbar-header"
            getRootElement={getNavBarRootElement}
        >
            {children}
        </MantineBaseProvider>
    </Box>
);
