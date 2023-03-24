import { assertUnreachable, FieldType, PivotData } from '@lightdash/common';
import { createStyles, Stack, Table, Title } from '@mantine/core';
import { FC } from 'react';
import { pivot1 } from './dummy_data/pivot1';
import { pivot2 } from './dummy_data/pivot2';

const getFieldColor = (fieldType: FieldType) => {
    switch (fieldType) {
        case FieldType.DIMENSION:
            return 'rgba(255,255,0,0.1)';
        case FieldType.METRIC:
            return 'rgba(0,122,255,0.1)';
        default:
            return assertUnreachable(
                fieldType,
                "Can't get color for field type",
            );
    }
};

const useStyles = createStyles((_theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },
    },
}));

const RenderTable: FC<{ data: PivotData }> = ({ data }) => {
    const { classes } = useStyles();

    return (
        <Table
            withBorder
            withColumnBorders
            highlightOnHover
            className={classes.table}
            w="xs"
        >
            <thead>
                {data.headerValueTypes.map(
                    (headerValueType, headerValueTypeIndex) => {
                        const headerValues =
                            data.headerValues[headerValueTypeIndex];

                        return (
                            <tr key={headerValueTypeIndex}>
                                <>
                                    {data.indexValueTypes.map(
                                        (_indexValueType, indexValueIndex) => {
                                            return (
                                                <th key={indexValueIndex}></th>
                                            );
                                        },
                                    )}

                                    {headerValues.map(
                                        (headerValue, headerValueIndex) => {
                                            return (
                                                <th
                                                    key={headerValueIndex}
                                                    style={{
                                                        backgroundColor:
                                                            getFieldColor(
                                                                headerValueType.type,
                                                            ),
                                                    }}
                                                >
                                                    {headerValue}
                                                </th>
                                            );
                                        },
                                    )}
                                </>
                            </tr>
                        );
                    },
                )}
            </thead>

            <tbody>
                {data.rows.map((row, i) => {
                    return (
                        <tr key={i}>
                            <>
                                {data.indexValueTypes.map(
                                    (indexValueType, indexValueTypeIndex) => {
                                        return (
                                            <td
                                                key={indexValueTypeIndex}
                                                style={{
                                                    backgroundColor:
                                                        getFieldColor(
                                                            indexValueType.type,
                                                        ),
                                                }}
                                            >
                                                {
                                                    data.indexValues[i][
                                                        indexValueTypeIndex
                                                    ]
                                                }
                                            </td>
                                        );
                                    },
                                )}

                                {row.map((value, rowIndex) => {
                                    return <td key={rowIndex}>{value}</td>;
                                })}
                            </>
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
};

const PivotingPOC = () => {
    return (
        <Stack spacing="lg">
            <Stack spacing="sm">
                <Title order={3}>Pivot 1</Title>
                <RenderTable data={pivot1} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 2</Title>
                <RenderTable data={pivot2} />
            </Stack>
        </Stack>
    );
};

export default PivotingPOC;
