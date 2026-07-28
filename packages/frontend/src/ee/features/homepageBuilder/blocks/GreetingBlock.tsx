import { Box, Stack, Text, TextInput } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import { getGreeting } from '../greeting';
import { type BlockComponentProps, type BuildComponentProps } from './types';

// Same type scale as the day-0 opening, so a greeting-led homepage and day-0
// read identically.
const Greeting: FC<{ subtitle: string }> = ({ subtitle }) => {
    const { user } = useApp();
    return (
        <Box ta="center">
            <Text component="h1" fz={23} fw={600} lts="-0.02em" lh={1.2} m={0}>
                {getGreeting(user.data?.firstName)}
            </Text>
            {subtitle.trim() ? (
                <Text c="dimmed" fz={15} mt={8}>
                    {subtitle}
                </Text>
            ) : null}
        </Box>
    );
};

export const GreetingBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'greeting') return null;
    return <Greeting subtitle={block.config.subtitle} />;
};

export const GreetingBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    if (block.type !== 'greeting') return null;
    return (
        <Stack gap="sm">
            <Greeting subtitle={block.config.subtitle} />
            <TextInput
                size="xs"
                label="Line under the greeting"
                placeholder="Pick up where you left off, or start something new."
                value={block.config.subtitle}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: { subtitle: e.currentTarget.value },
                    })
                }
            />
        </Stack>
    );
};
