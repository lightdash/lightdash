import { Box, Stack, Text, TextInput } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import { getGreeting } from '../greeting';
import layout from '../homepageLayout.module.css';
import { HeroDensityControl } from './AskAiHeroBlock';
import { type BlockComponentProps, type BuildComponentProps } from './types';

// Same type scale as the day-0 opening, so a greeting-led homepage and day-0
// read identically.
const Greeting: FC<{ subtitle: string }> = ({ subtitle }) => {
    const { user } = useApp();
    return (
        <Box ta="center">
            <Text component="h1" className={layout.heroGreeting}>
                {getGreeting(user.data?.firstName)}
            </Text>
            {subtitle.trim() ? (
                <Text className={layout.heroGreetingSub}>{subtitle}</Text>
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
                        config: {
                            ...block.config,
                            subtitle: e.currentTarget.value,
                        },
                    })
                }
            />
            <HeroDensityControl
                value={block.config.density}
                onChange={(density) =>
                    onChange({ ...block, config: { ...block.config, density } })
                }
            />
        </Stack>
    );
};
