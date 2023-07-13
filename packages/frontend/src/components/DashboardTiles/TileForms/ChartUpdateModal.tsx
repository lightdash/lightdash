import { DashboardChartTile } from '@lightdash/common';
import {
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
import { IconChartAreaLine } from '@tabler/icons-react';
import produce from 'immer';
import React from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
    tile: DashboardChartTile;
    title: string;
    placeholder: string;
    onClose: () => void;
    onConfirm?: (tile: DashboardChartTile) => void;
}

const ChartUpdateModal = ({
    tile,
    title,
    placeholder,
    onClose,
    onConfirm,
    ...modalProps
}: ChartUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            uuid: '',
            title,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);

    const handleConfirm = form.onSubmit(
        ({ title: newTitle, uuid: newChartUuid }) => {
            onConfirm?.(
                produce(tile, (draft) => {
                    draft.properties = {
                        ...draft.properties,
                        title: newTitle,
                        savedChartUuid: newChartUuid,
                    };
                }),
            );
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
                    <TextInput
                        label="Title"
                        placeholder={placeholder}
                        {...form.getInputProps('title')}
                    />
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
