import { Stack, TextInput } from '@mantine-8/core';
import { type FC } from 'react';
import { HeroDensityControl, HeroOpeningControl } from './AskAiHeroBlock';
import { GreetingHero } from './GreetingHero';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export const GreetingBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'greeting') return null;
    return <GreetingHero subtitle={block.config.subtitle} />;
};

export const GreetingBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    if (block.type !== 'greeting') return null;
    return (
        <Stack gap="sm">
            <GreetingHero subtitle={block.config.subtitle} />
            <HeroOpeningControl
                projectUuid={projectUuid}
                value="content-first"
                onSwap={() =>
                    onChange({
                        id: block.id,
                        type: 'ask-ai-hero',
                        config: {
                            showGreeting: true,
                            density: block.config.density,
                        },
                    })
                }
            />
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
