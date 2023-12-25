import { DashboardChartTile } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Modal,
    ModalProps,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine, IconEye, IconEyeOff } from '@tabler/icons-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
    onClose: () => void;
    hideTitle: boolean;
    onConfirm?: (
        newTitle: string | undefined,
        newChartUuid: string,
        shouldHideTitle: boolean,
    ) => void;
    tile: DashboardChartTile;
}

const ChartUpdateModal = ({
    onClose,
    onConfirm,
    hideTitle,
    tile,
    ...modalProps
}: ChartUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            uuid: tile.properties.savedChartUuid,
            title: tile.properties.title,
            hideTitle,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts } = useChartSummaries(projectUuid);

    const handleConfirm = form.onSubmit(
        ({
            title: newTitle,
            uuid: newChartUuid,
            hideTitle: shouldHideTitle,
        }) => {
            if (newChartUuid) {
                onConfirm?.(newTitle, newChartUuid, shouldHideTitle);
            }
        },
    );

    return (
        <Modal
            onClose={() => onClose?.()}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />
                    <Title order={4}>Edit title</Title>
                </Flex>
            }
            withCloseButton
            className="non-draggable"
            {...modalProps}
        >
            <form onSubmit={handleConfirm} name="Edit title">
                <Stack spacing="md">
                    <Flex align="flex-end" gap="xs">
                        <TextInput
                            label="Title"
                            placeholder={
                                form.values.uuid
                                    ? savedCharts?.find(
                                          (chart) =>
                                              chart.uuid === form.values.uuid,
                                      )?.name
                                    : undefined
                            }
                            {...form.getInputProps('title')}
                            style={{ flex: 1 }}
                            disabled={form.values.hideTitle}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            onClick={() =>
                                form.setFieldValue(
                                    'hideTitle',
                                    !form.values.hideTitle,
                                )
                            }
                        >
                            <MantineIcon
                                icon={
                                    form.values.hideTitle ? IconEyeOff : IconEye
                                }
                            />
                        </ActionIcon>
                    </Flex>

                    <Group spacing="xs" position="right" mt="md">
                        <Button onClick={() => onClose?.()} variant="outline">
                            Cancel
                        </Button>
                        <Button type="submit">Update</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
