import {
    DashboardTileTypes,
    defaultTileSize,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Modal,
    MultiSelect,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine } from '@tabler/icons-react';
import React, { forwardRef, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    description?: string;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, description, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <Stack spacing="two">
                <Tooltip
                    label={description}
                    disabled={!description}
                    position="top-start"
                >
                    <Text>{label}</Text>
                </Tooltip>
            </Stack>
        </div>
    ),
);

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isInitialLoading } =
        useChartSummaries(projectUuid);

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const form = useForm({
        initialValues: {
            savedChartsUuids: [],
        },
    });
    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedCharts?.sort((chartA, chartB) =>
            chartA.spaceUuid === dashboard?.spaceUuid
                ? -1
                : chartB.spaceUuid === dashboard?.spaceUuid
                ? 1
                : 0,
        );
        return (reorderedCharts || []).map(({ uuid, name, spaceName }) => {
            const alreadyAddedChart = dashboardTiles?.find((tile) => {
                return (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.savedChartUuid === uuid
                );
            });

            return {
                value: uuid,
                label: name,
                group: spaceName,
                description: alreadyAddedChart
                    ? 'This chart has already been added to this dashboard'
                    : undefined,
            };
        });
    }, [dashboardTiles, savedCharts, dashboard?.spaceUuid]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedCharts?.find((c) => c.uuid === uuid);
                return {
                    uuid: uuid4(),
                    properties: {
                        savedChartUuid: uuid,
                        chartName: chart?.name ?? '',
                    },
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    ...defaultTileSize,
                };
            }),
        );
        onClose();
    });

    if (!savedCharts || !dashboardTiles || isInitialLoading) return null;

    return (
        <Modal
            size="lg"
            opened={true}
            onClose={onClose}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />

                    <Title order={4}>Add saved charts</Title>
                </Flex>
            }
            withCloseButton
            closeOnClickOutside={false}
        >
            <Stack spacing="md">
                <form
                    id="add-saved-charts-to-dashboard"
                    onSubmit={handleSubmit}
                >
                    <MultiSelect
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
                        id="saved-charts"
                        label={`Select the charts you want to add to this dashboard`}
                        data={allSavedCharts}
                        disabled={isInitialLoading}
                        defaultValue={[]}
                        placeholder="Search..."
                        required
                        searchable
                        withinPortal
                        itemComponent={SelectItem}
                        {...form.getInputProps('savedChartsUuids')}
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
                        <Button type="submit" disabled={isInitialLoading}>
                            Add
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddChartTilesModal;
