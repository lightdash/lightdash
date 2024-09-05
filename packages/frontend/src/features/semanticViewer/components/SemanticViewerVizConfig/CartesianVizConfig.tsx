import { ChartKind, type SemanticLayerColumn } from '@lightdash/common';
import { ActionIcon, Divider, Group, Stack, Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { barChartConfigSlice } from '../../../../components/DataViz/store/barChartSlice';
import { lineChartConfigSlice } from '../../../../components/DataViz/store/lineChartSlice';
import { CartesianVizFieldConfig } from './CartesianVizFieldConfig';
import { CartesianVizStyling } from './CartesianVizStyling';

export const CartesianVizConfig = ({
    selectedChartType,
    columns,
}: {
    selectedChartType: ChartKind;
    columns: SemanticLayerColumn[];
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
                <CartesianVizFieldConfig
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
                <CartesianVizStyling
                    actions={actions}
                    selectedChartType={selectedChartType}
                />
            )}
        </Stack>
    );
};
