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
import React from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
    onClose: () => void;
    onConfirm?: (newTitle: string, newChartUuid: string) => void;
    tile: DashboardChartTile;
}

const ChartUpdateModal = ({
    onClose,
    onConfirm,
    tile,
    ...modalProps
}: ChartUpdateModalProps) => {
    const form = useForm({});
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);

    const [chartUuid, setChartUuid] = React.useState<string>(
        tile.properties.savedChartUuid ?? '',
    );
    const [chartTitle, setChartTitle] = React.useState<string>(
        tile.properties.title ?? '',
    );

    const handleConfirm = form.onSubmit(() => {
        onConfirm?.(chartTitle, chartUuid);
    });
    const handleClose = () => {
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
                        placeholder={
                            chartTitle.length > 0
                                ? chartTitle
                                : savedCharts?.find(
                                      (chart) => chart.uuid === chartUuid,
                                  )?.name
                        }
                        value={chartTitle}
                        onChange={(event) => {
                            setChartTitle(event.currentTarget.value);
                        }}
                        defaultValue={tile.properties.title}
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
                        searchable
                        value={chartUuid}
                        onChange={(value) => {
                            if (value) setChartUuid(value);
                        }}
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
                        <Button type="submit" disabled={}>
                            Update
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
