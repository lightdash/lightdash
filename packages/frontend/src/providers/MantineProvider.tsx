import { Colors } from '@blueprintjs/core';
import {
    MantineProvider as MantineProviderBase,
    MantineThemeOverride,
} from '@mantine/core';
import { FC } from 'react';

const themeOverride: MantineThemeOverride = {
    black: Colors.DARK_GRAY1,

    fontFamily:
        'BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Open Sans, Helvetica Neue, blueprint-icons-16, sans-serif',

    // TODO: temporary fix
    // lineHeight: 1.2858142857,
    // fontSizes: {
    //     xs: 11,
    //     sm: 12,
    //     md: 14,
    //     lg: 16,
    //     xl: 20,
    // },
};

const MantineProvider: FC = ({ children }) => {
    return (
        <MantineProviderBase
            withGlobalStyles
            withNormalizeCSS
            theme={themeOverride}
        >
            {children}
        </MantineProviderBase>
    );
};

export default MantineProvider;
