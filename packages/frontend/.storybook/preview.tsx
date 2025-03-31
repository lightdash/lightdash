import { MantineProvider } from '@mantine/core';
import React from 'react';
import { getMantineThemeOverride } from '../src/mantineTheme';

// All stories will have the Mantine theme applied
const ThemeWrapper = (props: { children: React.ReactNode }) => (
    <MantineProvider
        theme={getMantineThemeOverride()}
        withGlobalStyles
        withNormalizeCSS
    >
        {props.children}
    </MantineProvider>
);

export const decorators = [
    (renderStory: Function) => <ThemeWrapper>{renderStory()}</ThemeWrapper>,
];
