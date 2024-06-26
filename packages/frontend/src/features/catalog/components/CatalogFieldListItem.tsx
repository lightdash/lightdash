import {
    ChartType,
    FieldType,
    getItemId,
    type CatalogField,
} from '@lightdash/common';
import { Box, Button, Group, Highlight } from '@mantine/core';
import { Icon123, IconAbc, IconSearch } from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { useCatalogContext } from '../context/CatalogProvider';

type Props = {
    field: CatalogField;
    searchString?: string;
    isSelected?: boolean;

    onClick?: () => void;
};

export const CatalogFieldListItem: FC<React.PropsWithChildren<Props>> = ({
    field,
    searchString = '',
    isSelected = false,
    onClick,
}) => {
    const history = useHistory();
    const [hovered, setHovered] = useState<boolean | undefined>(false);
    const { projectUuid } = useCatalogContext();

    const exploreWithFieldUrl = useMemo(
        () =>
            getExplorerUrlFromCreateSavedChartVersion(projectUuid, {
                tableName: field.tableName,
                metricQuery: {
                    exploreName: field.tableName,
                    dimensions:
                        field.fieldType === FieldType.DIMENSION
                            ? [
                                  getItemId({
                                      name: field.name,
                                      table: field.tableName,
                                  }),
                              ]
                            : [],
                    metrics:
                        field.fieldType === FieldType.METRIC
                            ? [
                                  getItemId({
                                      name: field.name,
                                      table: field.tableName,
                                  }),
                              ]
                            : [],
                    tableCalculations: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                },
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {},
                        eChartsConfig: {},
                    },
                },
                tableConfig: {
                    columnOrder: [],
                },
            }),
        [field.fieldType, field.name, field.tableName, projectUuid],
    );

    return (
        <>
            <Group
                noWrap
                pos="relative"
                sx={(theme) => ({
                    cursor: 'pointer',
                    borderRadius: theme.radius.sm,
                    backgroundColor: hovered
                        ? theme.colors.gray[1]
                        : 'transparent',
                    border: `2px solid ${
                        isSelected ? theme.colors.blue[6] : 'transparent'
                    }`,
                })}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => history.push(exploreWithFieldUrl)}
                py="two"
                mr="xs"
            >
                <Box miw={150}>
                    <Group
                        spacing="xs"
                        noWrap
                        w="fit-content"
                        px="xs"
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.gray[2]}`,
                            borderRadius: theme.radius.md,
                        })}
                    >
                        <MantineIcon
                            icon={
                                // TODO: Add icon for field type and for subtype
                                field.fieldType === FieldType.DIMENSION
                                    ? IconAbc
                                    : Icon123
                            }
                            // TODO: update when new icons are added
                            color={
                                field.fieldType === FieldType.DIMENSION
                                    ? 'blue'
                                    : 'orange'
                            }
                        />

                        <Highlight
                            highlight={searchString}
                            highlightColor="yellow"
                            fw={500}
                            fz="sm"
                        >
                            {field.label ?? ''}
                        </Highlight>
                    </Group>
                </Box>
                {(hovered || isSelected) && (
                    <Box
                        pos={'absolute'}
                        right={10}
                        sx={{
                            zIndex: 20,
                        }}
                    >
                        <Button
                            size="xs"
                            compact
                            sx={(theme) => ({
                                backgroundColor: theme.colors.gray[8],
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[9],
                                },
                            })}
                            leftIcon={
                                <MantineIcon icon={IconSearch} size="sm" />
                            }
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick?.();
                            }}
                        >
                            More info
                        </Button>
                    </Box>
                )}
            </Group>
        </>
    );
};
