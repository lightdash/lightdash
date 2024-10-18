import { type VizColumn } from '@lightdash/common';
import { ActionIcon, ScrollArea, TextInput } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TableFieldIcon } from '../../../../components/DataViz/Icons';
import {
    updateColumnVisibility,
    updateFieldLabel,
} from '../../../../components/DataViz/store/tableVisSlice';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../../features/sqlRunner/store/hooks';

const TableVisConfiguration: FC<{ columns: VizColumn[] }> = ({ columns }) => {
    const dispatch = useVizDispatch();

    const columnsConfig = useVizSelector(
        (state) => state.tableVisConfig.columns,
    );

    if (!columnsConfig) {
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

                    {Object.keys(columnsConfig).map((reference) => {
                        const fieldType = columns?.find(
                            (c) => c.reference === reference,
                        )?.type;

                        return (
                            <TextInput
                                key={reference}
                                radius="md"
                                value={columnsConfig[reference].label}
                                icon={
                                    fieldType && (
                                        <TableFieldIcon fieldType={fieldType} />
                                    )
                                }
                                rightSection={
                                    <ActionIcon
                                        onClick={() =>
                                            dispatch(
                                                updateColumnVisibility({
                                                    reference,
                                                    visible:
                                                        !columnsConfig[
                                                            reference
                                                        ].visible,
                                                }),
                                            )
                                        }
                                    >
                                        <MantineIcon
                                            icon={
                                                columnsConfig[reference].visible
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
