import {
    assertUnreachable,
    Dashboard,
    DashboardTileTypes,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Modal,
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
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';

type Tile = Dashboard['tiles'][number];

interface TileUpdateModalProps {
    tile: Tile;
    onClose?: () => void;
    onConfirm?: (tile: Tile) => void;
    isOpen: boolean;
}

const TileUpdateModal = ({
    tile,
    onClose,
    onConfirm,
    isOpen,
}: TileUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            properties: tile.properties,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);
    const { dashboard } = useDashboardContext();

    const handleConfirm = form.onSubmit(async ({ properties }) => {
        onConfirm?.(
            produce(tile, (draft) => {
                draft.properties = properties;
            }),
        );
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Modal
            opened={isOpen}
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
        >
            <Stack spacing="md">
                <form onSubmit={handleConfirm} name="Edit tile content">
                    {tile.type === DashboardTileTypes.SAVED_CHART ? (
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
                                        chart.spaceUuid ===
                                        dashboard?.spaceUuid,
                                )?.uuid
                            }
                            required
                            withinPortal
                            {...form.getInputProps('properties.savedChartUuid')}
                        />
                    ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm />
                    ) : tile.type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm />
                    ) : (
                        assertUnreachable(tile, 'Tile type not supported')
                    )}
                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                            }}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button type="submit">Add</Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default TileUpdateModal;
