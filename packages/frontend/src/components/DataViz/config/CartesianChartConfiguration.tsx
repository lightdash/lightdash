import { ChartKind, type VizColumn } from '@lightdash/common';
import { ActionIcon, Divider, Group, Stack, Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { barChartConfigSlice } from '../store/barChartSlice';
import { lineChartConfigSlice } from '../store/lineChartSlice';
import { CartesianChartFieldConfiguration } from './CartesianChartFieldConfiguration';
import { CartesianChartStyling } from './CartesianChartStyling';

export const CartesianChartConfig = ({
    selectedChartType,
    columns,
}: {
    selectedChartType: ChartKind;
    columns: VizColumn[];
}) => {
    const [isFieldConfigurationOpen, setIsFieldConfigurationOpen] =
        useState(true);
    const [isStylingOpen, setIsStylingOpen] = useState(false);

    const actions =
        selectedChartType === ChartKind.LINE
            ? lineChartConfigSlice.actions
            : selectedChartType === ChartKind.VERTICAL_BAR
            ? barChartConfigSlice.actions
            : null;

    if (!actions) {
        return null;
    }

    return (
        <Stack spacing="xs" mb="lg">
            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    Data
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() =>
                            setIsFieldConfigurationOpen(
                                !isFieldConfigurationOpen,
                            )
                        }
                        icon={
                            isFieldConfigurationOpen
                                ? IconChevronDown
                                : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isFieldConfigurationOpen && (
                <CartesianChartFieldConfiguration
                    actions={actions}
                    columns={columns}
                    selectedChartType={selectedChartType}
                />
            )}

            <Divider my="sm" />

            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    Styling
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() => setIsStylingOpen(!isStylingOpen)}
                        icon={
                            isStylingOpen ? IconChevronDown : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isStylingOpen && (
                <CartesianChartStyling
                    actions={actions}
                    selectedChartType={selectedChartType}
                />
            )}
        </Stack>
    );
};
