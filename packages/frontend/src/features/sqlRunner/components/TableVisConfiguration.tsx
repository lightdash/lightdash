import { ActionIcon, TextInput } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    updateColumnVisibility,
    updateFieldLabel,
} from '../store/tableVisSlice';
import { TableFieldIcon } from './TableFields';

const TableVisConfiguration: FC = ({}) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);

    const tableVisConfig = useAppSelector(
        (state) => state.tableVisConfig.config,
    );

    if (!tableVisConfig) {
        return null;
    }

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Column labels</Config.Heading>
                {Object.keys(tableVisConfig.columns).map((reference) => {
                    const fieldType = sqlColumns?.find(
                        (c) => c.reference === reference,
                    )?.type;

                    return (
                        <TextInput
                            key={reference}
                            radius="md"
                            value={tableVisConfig.columns[reference].label}
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
                                                    !tableVisConfig.columns[
                                                        reference
                                                    ].visible,
                                            }),
                                        )
                                    }
                                >
                                    <MantineIcon
                                        icon={
                                            tableVisConfig.columns[reference]
                                                .visible
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
    );
};

export default TableVisConfiguration;
