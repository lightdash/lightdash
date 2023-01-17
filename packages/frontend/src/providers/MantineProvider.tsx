import {
    MantineProvider as MantineProviderBase,
    MantineThemeOverride,
} from '@mantine/core';
import { FC } from 'react';

// default overrides to match with blueprint
const theme: MantineThemeOverride = {
    fontFamily:
        '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Open Sans,Helvetica Neue,blueprint-icons-16,sans-serif',
    fontSizes: {
        md: 14,
    },
    lineHeight: 1.2858142857,
    black: '#1c2127',
};

export const MantineProvider: FC = ({ children }) => {
    return (
        <MantineProviderBase withGlobalStyles withNormalizeCSS theme={theme}>
            {children}
        </MantineProviderBase>
    );
};
