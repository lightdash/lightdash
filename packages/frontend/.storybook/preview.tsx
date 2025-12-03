import '@mantine-8/core/styles.css';

import React from 'react';
import { getMantineThemeOverride } from '../src/mantineTheme';
import Mantine8Provider from '../src/providers/Mantine8Provider';
import MantineProvider from '../src/providers/MantineProvider';

// All stories will have the Mantine theme applied
const ThemeWrapper = (props: { children: React.ReactNode }) => (
    <MantineProvider
        theme={getMantineThemeOverride('light')}
        withGlobalStyles
        withNormalizeCSS
    >
        <Mantine8Provider>{props.children}</Mantine8Provider>
    </MantineProvider>
);

export const decorators = [
    (renderStory: Function) => <ThemeWrapper>{renderStory()}</ThemeWrapper>,
];
