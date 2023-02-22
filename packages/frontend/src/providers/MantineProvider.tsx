import { Colors } from '@blueprintjs/core';
import {
    MantineProvider as MantineProviderBase,
    MantineThemeOverride,
} from '@mantine/core';
import { FC } from 'react';

const themeOverride: MantineThemeOverride = {
    black: Colors.DARK_GRAY1,

    fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'Oxygen',
        'Ubuntu',
        'Cantarell',
        'Fira Sans',
        'Droid Sans',
        'Open Sans',
        'Helvetica Neue',
        'blueprint-icons-16',
        'Apple Color Emoji',
        'Segoe UI Emoji',
        'sans-serif',
    ].join(', '),

    lineHeight: 1.2858142857,

    globalStyles: () => ({
        body: {
            textTransform: 'none',
            fontSize: '14px',
        },

        p: {
            marginBottom: '10px',
            marginTop: 0,
        },

        small: {
            fontSize: '12px',
        },

        b: {
            fontWeight: 500,
        },

        strong: {
            fontWeight: 600,
        },

        a: {
            color: Colors.BLUE2,
            textDecoration: 'none',
            ':hover': {
                color: Colors.BLUE2,
                cursor: 'pointer',
                textDecoration: 'underline',
            },
        },

        ':focus': {
            outline: 'rgba(45, 114, 210, 0.6) solid 2px',
            outlineOffset: '2px',
            '-moz-outline-radius': '6px',
        },
    }),
};

const MantineProvider: FC = ({ children }) => {
    return (
        <MantineProviderBase
            withGlobalStyles
            withNormalizeCSS
            inherit
            withCSSVariables
            theme={themeOverride}
        >
            {children}
        </MantineProviderBase>
    );
};

export default MantineProvider;
