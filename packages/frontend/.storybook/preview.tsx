import '@mantine-8/core/styles.css';

import { ActionIcon, Group } from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import React from 'react';
import Mantine8Provider from '../src/providers/Mantine8Provider';
import MantineProvider from '../src/providers/MantineProvider';

// Theme toggle button component
const ThemeToggle = () => {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();

    return (
        <Group
            gap="xs"
            p="md"
            style={{
                position: 'fixed',
                top: 10,
                right: 10,
                zIndex: 10000,
            }}
        >
            <ActionIcon
                onClick={() => toggleColorScheme()}
                variant="default"
                size="lg"
                aria-label="Toggle color scheme"
            >
                {colorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
            </ActionIcon>
        </Group>
    );
};

// All stories will have the Mantine theme applied with a theme toggle
const ThemeWrapper = (props: { children: React.ReactNode }) => {
    return (
        <MantineProvider withGlobalStyles withNormalizeCSS>
            <Mantine8Provider>
                <ThemeToggle />
                {props.children}
            </Mantine8Provider>
        </MantineProvider>
    );
};

export const decorators = [
    (renderStory: Function) => <ThemeWrapper>{renderStory()}</ThemeWrapper>,
];
