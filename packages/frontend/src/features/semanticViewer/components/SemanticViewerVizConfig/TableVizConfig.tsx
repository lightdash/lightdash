import { type SemanticLayerField } from '@lightdash/common';
import { ActionIcon, ScrollArea, TextInput } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TableFieldIcon } from '../../../../components/DataViz/Icons';
import {
    useVizDispatch,
    useVizSelector,
} from '../../../../components/DataViz/store';
import {
    updateColumnVisibility,
    updateFieldLabel,
} from '../../../../components/DataViz/store/tableVisSlice';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { getDimensionTypeFromSemanticLayerFieldType } from '../../store/semanticViewerSlice';

const TableVisConfiguration: FC<{ fields: SemanticLayerField[] }> = ({
    fields,
}) => {
    const dispatch = useVizDispatch();

    const tableVisConfig = useVizSelector(
        (state) => state.tableVisConfig.config,
    );

    if (!tableVisConfig) {
        return null;
    }

    return (
        <ScrollArea
            offsetScrollbars
            variant="primary"
            className="only-vertical"
            type="auto"
            sx={{ flex: 1 }}
            mb="md"
        >
            <Config>
                <Config.Section>
                    <Config.Heading>Column labels</Config.Heading>

                    {Object.keys(tableVisConfig.columns).map((reference) => {
                        const fieldType = fields?.find(
                            (c) => c.name === reference,
                        )?.type;

                        return (
                            <TextInput
                                key={reference}
                                radius="md"
                                value={tableVisConfig.columns[reference].label}
                                icon={
                                    fieldType && (
                                        <TableFieldIcon
                                            fieldType={getDimensionTypeFromSemanticLayerFieldType(
                                                fieldType,
                                            )}
                                        />
                                    )
                                }
                                rightSection={
                                    <ActionIcon
                                        onClick={() =>
                                            dispatch(
                                                updateColumnVisibility({
                                                    reference,
                                                    visible:
                                                        !tableVisConfig.columns[
                                                            reference
                                                        ].visible,
                                                }),
                                            )
                                        }
                                    >
                                        <MantineIcon
                                            icon={
                                                tableVisConfig.columns[
                                                    reference
                                                ].visible
                                                    ? IconEye
                                                    : IconEyeOff
                                            }
                                        />
                                    </ActionIcon>
                                }
                                onChange={(e) => {
                                    dispatch(
                                        updateFieldLabel({
                                            reference,
                                            label: e.target.value,
                                        }),
                                    );
                                }}
                            />
                        );
                    })}
                </Config.Section>
            </Config>
        </ScrollArea>
    );
};

export default TableVisConfiguration;
