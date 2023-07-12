import { DashboardChartTile } from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Modal,
    ModalProps,
    Select,
    Stack,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine } from '@tabler/icons-react';
import produce from 'immer';
import React from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
    tile: DashboardChartTile;
    onClose: () => void;
    onConfirm?: (tile: DashboardChartTile) => void;
}

const ChartUpdateModal = ({
    tile,
    onClose,
    onConfirm,
    ...modalProps
}: ChartUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            uuid: tile.properties.savedChartUuid,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);
    const { dashboard } = useDashboardContext();

    const handleConfirm = form.onSubmit(async ({ uuid }) => {
        onConfirm?.(
            produce(tile, (draft) => {
                draft.properties.savedChartUuid = uuid;
            }),
        );
    });

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
            {...modalProps}
        >
            <Stack spacing="md">
                <form onSubmit={handleConfirm} name="Edit tile content">
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
                        label="Select a saved chart"
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
                        defaultValue={
                            savedCharts?.find(
                                (chart) =>
                                    chart.spaceUuid === dashboard?.spaceUuid,
                            )?.uuid
                        }
                        required
                        withinPortal
                        {...form.getInputProps('uuid')}
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
                        <Button type="submit">Replace</Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default ChartUpdateModal;
