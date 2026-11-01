import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { DEFAULT_GREETING_SUBTITLE } from '../greeting';
import { HeroDensityControl } from './AskAiHeroBlock';
import classes from './blockStyles.module.css';
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
        <Stack gap="md">
            <GreetingHero
                subtitle={block.config.subtitle}
                subtitleSlot={
                    <input
                        className={classes.inlineSubtitle}
                        aria-label="Line under the greeting"
                        placeholder={DEFAULT_GREETING_SUBTITLE}
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
