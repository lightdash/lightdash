import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateFieldLabel } from '../store/tableVisSlice';

const TableVisConfiguration: FC = ({}) => {
    const dispatch = useAppDispatch();

    const tableVisConfig = useAppSelector(
        (state) => state.tableVisConfig.config,
    );

    if (!tableVisConfig) {
        return null;
    }

    return (
        <Stack spacing="xs">
            {Object.keys(tableVisConfig.columns).map((reference) => (
                <EditableText
                    key={reference}
                    value={tableVisConfig.columns[reference].label}
                    onChange={(e) => {
                        dispatch(
                            updateFieldLabel({
                                reference,
                                label: e.target.value,
                            }),
                        );
                    }}
                />
            ))}
        </Stack>
    );
};

export default TableVisConfiguration;
