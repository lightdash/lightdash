import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Modal,
    ModalProps,
    Select,
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
    chartTitle: string;
    onClose: () => void;
    onConfirm?: (
        newTitle: string,
        newChartUuid: string,
        shouldShowTitle: boolean,
    ) => void;
    hideTitle: boolean;
}

const ChartUpdateModal = ({
    chartTitle,
    onClose,
    onConfirm,
    hideTitle,
    ...modalProps
}: ChartUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            uuid: '',
            title: '',
            hideTitle,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);

    const handleConfirm = form.onSubmit(
        ({
            title: newTitle,
            uuid: newChartUuid,
            hideTitle: shouldHideTitle,
        }) => {
            onConfirm?.(newTitle, newChartUuid, shouldHideTitle);
        },
    );

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Modal
            onClose={handleClose}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />
                    <Title order={4}>Edit tile content</Title>
                </Flex>
            }
            withCloseButton
            className="non-draggable"
            {...modalProps}
        >
            <form onSubmit={handleConfirm} name="Edit tile content">
                <Stack spacing="md">
                    <Flex align="flex-end" gap="sm">
                        <TextInput
                            label="Title"
                            placeholder={
                                form.getInputProps('title').value.length > 0
                                    ? form.getInputProps('title').value
                                    : chartTitle
                            }
                            {...form.getInputProps('title')}
                            style={{ flex: 1 }}
                            disabled={form.values.hideTitle}
                        />
                        <ActionIcon
                            variant="outline"
                            color="gray.4"
                            h={36}
                            size="lg"
                            radius="md"
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
                                size={25}
                                color="dark.2"
                            />
                        </ActionIcon>
                    </Flex>
                    <Select
                        styles={(theme) => ({
                            separator: {
                                position: 'sticky',
                                top: 0,
                                backgroundColor: 'white',
                            },
                            separatorLabel: {
                                color: theme.colors.gray[6],
                                fontWeight: 500,
                            },
                        })}
                        id="savedChartUuid"
                        name="savedChartUuid"
                        label="Select chart"
                        data={(savedCharts || []).map(
                            ({ uuid, name, spaceName }) => {
                                return {
                                    value: uuid,
                                    label: name,
                                    group: spaceName,
                                };
                            },
                        )}
                        disabled={isLoading}
                        withinPortal
                        {...form.getInputProps('uuid')}
                        searchable
                        placeholder="Search..."
                    />
                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                            }}
                            variant="outline"
                        >
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
