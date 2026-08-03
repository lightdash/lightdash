import { Stack, TextInput } from '@mantine-8/core';
import { type FC } from 'react';
import { HeroDensityControl } from './AskAiHeroBlock';
import { GreetingHero } from './GreetingHero';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export const GreetingBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'greeting') return null;
    return <GreetingHero subtitle={block.config.subtitle} />;
};

export const GreetingBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    if (block.type !== 'greeting') return null;
    return (
        <Stack gap="sm">
            <GreetingHero subtitle={block.config.subtitle} />
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
