import { Code, Stack, Text, TextInput, Title } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const resolveTokens = (text: string, firstName: string | undefined): string =>
    text.replaceAll('{name}', firstName ?? 'there');

export const HeroBlockView: FC<BlockComponentProps> = ({ block }) => {
    const { user } = useApp();
    if (block.type !== 'hero') return null;
    return (
        <Stack gap={4}>
            <Title order={1} fw={600}>
                {resolveTokens(block.config.title, user.data?.firstName)}
            </Title>
            <Text size="md" c="dimmed">
                {resolveTokens(block.config.subtitle, user.data?.firstName)}
            </Text>
        </Stack>
    );
};

export const HeroBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    if (block.type !== 'hero') return null;
    return (
        <Stack gap="xs">
            <TextInput
                aria-label="Hero title"
                size="lg"
                fw={600}
                value={block.config.title}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            title: e.currentTarget.value,
                        },
                    })
                }
            />
            <TextInput
                aria-label="Hero subtitle"
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
            <Text size="xs" c="dimmed">
                <Code>{'{name}'}</Code> personalizes per viewer
            </Text>
        </Stack>
    );
};
