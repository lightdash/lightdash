import { Badge, Paper, Table, useMantineTheme } from '@mantine/core';
import { type FC, type SetStateAction } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { type useCatalogContext } from '../context/CatalogProvider';
import { type useCatalogAnalytics } from '../hooks/useCatalogAnalytics';

type Props = {
    metadata: ReturnType<typeof useCatalogContext>['metadata'];
    selection: ReturnType<typeof useCatalogContext>['selection'];
    getAnalytics: ReturnType<typeof useCatalogAnalytics>['mutate'];
    setSelectedFieldInTable: (
        value: SetStateAction<string | undefined>,
    ) => void;
};

export const CatalogMetadataFieldsTable: FC<Props> = ({
    metadata,
    selection,
    getAnalytics,
    setSelectedFieldInTable,
}) => {
    const { colors } = useMantineTheme();
    const { classes, cx } = useTableStyles();
    return (
        <Paper withBorder>
            <Table className={cx(classes.root, classes.smallPadding)}>
                <thead>
                    <tr>
                        <th>Field</th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>
                    {metadata?.fields?.map((field) => (
                        <tr
                            key={field.name}
                            style={{
                                border:
                                    selection?.field === field.name
                                        ? `2px solid ${colors.blue[6]}`
                                        : undefined,
                            }}
                        >
                            <td
                                style={{
                                    color: `${colors.blue[6]}`,
                                    cursor: 'pointer',
                                }}
                                onClick={() => {
                                    setSelectedFieldInTable(field.name);
                                    if (selection?.table)
                                        getAnalytics({
                                            table: selection.table,
                                            field: field.name,
                                        });
                                }}
                            >
                                {field.label}
                            </td>
                            <td>
                                <Badge
                                    color="gray.4"
                                    radius="lg"
                                    size="xs"
                                    fz="xs"
                                    fw={500}
                                    style={{
                                        textTransform: 'none',
                                        color: colors.gray[6],
                                    }}
                                >
                                    {field.basicType}
                                </Badge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </Paper>
    );
};
