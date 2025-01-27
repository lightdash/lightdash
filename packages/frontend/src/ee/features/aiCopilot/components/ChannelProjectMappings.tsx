import { type SlackAppCustomSettings } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Paper,
    Radio,
    Select,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import {
    IconArrowsHorizontal,
    IconDatabase,
    IconHash,
    IconHelpCircle,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';

type Props = {
    channelOptions: { value: string; label: string }[];
    projectOptions: { value: string; label: string }[];
    form: UseFormReturnType<SlackAppCustomSettings>;
};

type ChannelProjectMappingProps = Props & {
    index: number;
    usedChannels: string[];
    onDelete: () => void;
};

const ChannelProjectMapping: FC<ChannelProjectMappingProps> = ({
    form,
    index,
    channelOptions,
    projectOptions,
    usedChannels,
    onDelete,
}) => {
    const showTagsInput =
        form.values.slackChannelProjectMappings?.[index]?.availableTags !==
        null;

    return (
        <Paper py="xs" shadow="xs" withBorder>
            <Stack spacing="xs">
                <Group px="xs" spacing="xs" noWrap>
                    <Select
                        size="xs"
                        data={projectOptions}
                        searchable
                        placeholder="Select project"
                        icon={<MantineIcon icon={IconDatabase} />}
                        {...form.getInputProps(
                            `slackChannelProjectMappings.${index}.projectUuid`,
                        )}
                    />

                    <MantineIcon icon={IconArrowsHorizontal} color="gray.5" />

                    <Select
                        size="xs"
                        data={channelOptions.map((channel) => ({
                            value: channel.value,
                            label: channel.label.replace(/^#/, ''),
                            disabled: usedChannels.includes(channel.value),
                        }))}
                        searchable
                        placeholder="Select channel"
                        icon={<MantineIcon icon={IconHash} />}
                        {...form.getInputProps(
                            `slackChannelProjectMappings.${index}.slackChannelId`,
                        )}
                    />

                    <ActionIcon onClick={onDelete}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>

                <Divider />

                <Stack px="xs" spacing="xs">
                    <Radio.Group
                        size="xs"
                        label="Configure available tags"
                        value={showTagsInput ? 'tags' : 'all'}
                        onChange={(value) => {
                            form.setFieldValue(
                                `slackChannelProjectMappings.${index}.availableTags`,
                                value === 'all' ? null : [],
                            );
                        }}
                    >
                        <Stack spacing="xs" pt="xs">
                            <Radio
                                value="all"
                                label="All dimensions, and metrics"
                            />
                            <Radio
                                value="tags"
                                label="Only dimensions and metrics with any of the following tags"
                            />

                            {showTagsInput && (
                                <TagInput
                                    size="xs"
                                    placeholder='Type in tags and press "Enter"'
                                    {...form.getInputProps(
                                        `slackChannelProjectMappings.${index}.availableTags`,
                                    )}
                                />
                            )}
                        </Stack>
                    </Radio.Group>
                </Stack>
            </Stack>
        </Paper>
    );
};

const ChannelProjectMappings: FC<Props> = ({
    channelOptions,
    projectOptions,
    form,
}) => {
    const mappings = form.values.slackChannelProjectMappings;

    const usedChannels = useMemo(() => {
        return mappings?.map((mapping) => mapping.slackChannelId) ?? [];
    }, [mappings]);

    const handleDelete = useCallback(
        (index: number) =>
            form.removeListItem('slackChannelProjectMappings', index),
        [form],
    );

    const handleAdd = useCallback(
        () =>
            form.insertListItem('slackChannelProjectMappings', {
                projectUuid: null,
                slackChannelId: null,
                availableTags: null,
            }),
        [form],
    );

    return (
        <Stack spacing="sm" w="100%">
            <Group spacing="two" mb="two">
                <Title order={6} fw={500}>
                    AI Bot channel mappings
                </Title>

                <Tooltip
                    variant="xs"
                    multiline
                    maw={250}
                    label="Map which project is associated with which Slack channel. When a user asks a question in a channel, Lightdash will look for the answer in the associated project."
                >
                    <MantineIcon icon={IconHelpCircle} />
                </Tooltip>
            </Group>

            <Stack spacing="sm">
                {form.values.slackChannelProjectMappings?.map(
                    (mapping, index) => (
                        <ChannelProjectMapping
                            key={`${mapping.projectUuid}-${mapping.slackChannelId}`}
                            form={form}
                            index={index}
                            projectOptions={projectOptions}
                            channelOptions={channelOptions}
                            usedChannels={usedChannels}
                            onDelete={() => handleDelete(index)}
                        />
                    ),
                )}

                <div>
                    <Button
                        disabled={!form.isValid()}
                        onClick={handleAdd}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        size="xs"
                    >
                        Add New Mapping
                    </Button>
                </div>
            </Stack>
        </Stack>
    );
};

export default ChannelProjectMappings;
