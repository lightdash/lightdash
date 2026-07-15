import { subject } from '@casl/ability';
import {
    Box,
    Button,
    Code,
    Group,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconSquareRoundedPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { Can } from '../../../../providers/Ability';
import useApp from '../../../../providers/App/useApp';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const resolveTokens = (text: string, firstName: string | undefined): string =>
    text.replaceAll('{name}', firstName ?? 'there');

export const HeroBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const { user } = useApp();
    if (block.type !== 'hero') return null;
    return (
        <Group justify="space-between" align="flex-end" gap="md" wrap="nowrap">
            <Box>
                <Text
                    component="h1"
                    fz={28}
                    fw={600}
                    lts="-0.02em"
                    m={0}
                    lh={1.2}
                >
                    {resolveTokens(block.config.title, user.data?.firstName)}
                </Text>
                <Text fz={15} c="dimmed" mt={5}>
                    {resolveTokens(block.config.subtitle, user.data?.firstName)}
                </Text>
            </Box>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Button
                    component={Link}
                    to={`/projects/${projectUuid}/tables`}
                    leftSection={<MantineIcon icon={IconSquareRoundedPlus} />}
                    style={{ flexShrink: 0 }}
                >
                    New
                </Button>
            </Can>
        </Group>
    );
};

export const HeroBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    if (block.type !== 'hero') return null;
    return (
        <Stack gap={4}>
            <TextInput
                aria-label="Hero title"
                variant="unstyled"
                size="xl"
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
                variant="unstyled"
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
            <Text size="xs" c="dimmed" mt={2}>
                <Code>{'{name}'}</Code> personalizes per viewer
            </Text>
        </Stack>
    );
};
