import { FieldType, getItemId, type CatalogField } from '@lightdash/common';
import { Badge, Box, Grid, Highlight } from '@mantine/core';
import { Icon123, IconAbc } from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineLinkButton from '../../../components/common/MantineLinkButton';
import {
    DEFAULT_EMPTY_EXPLORE_CONFIG,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
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
    const {
        setSelectedTable,
        setIsViewingCatalog,
        setExplorerUrlState,
        setHasSelectedField,
    } = useCatalogContext();
    const [hovered, setHovered] = useState<boolean | undefined>(false);
    const { projectUuid } = useCatalogContext();
    const fieldToExplore = getItemId({
        name: field.name,
        table: field.tableName,
    });
    const chartDraft = useMemo(
        () => ({
            ...DEFAULT_EMPTY_EXPLORE_CONFIG,
            tableName: field.tableName,
            metricQuery: {
                ...DEFAULT_EMPTY_EXPLORE_CONFIG.metricQuery,
                exploreName: field.tableName,
                ...(field.fieldType === FieldType.DIMENSION
                    ? {
                          dimensions: [fieldToExplore],
                      }
                    : field.fieldType === FieldType.METRIC
                    ? {
                          metrics: [fieldToExplore],
                      }
                    : []),
            },
        }),
        [field.fieldType, field.tableName, fieldToExplore],
    );

    const exploreWithFieldUrl = useMemo(() => {
        const draftChartUrl = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            chartDraft,
        );

        return `${draftChartUrl.pathname}?${draftChartUrl.search}`;
    }, [chartDraft, projectUuid]);

    return (
        <Grid
            pos="relative"
            gutter="xs"
            columns={24}
            sx={(theme) => ({
                cursor: 'pointer',
                // Mantine's grid applies a negative margin to the container. That breaks the border radius & hover effects
                margin: 0,
                alignItems: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: hovered ? theme.colors.gray[1] : 'transparent',
                border: `2px solid ${
                    isSelected ? theme.colors.blue[6] : 'transparent'
                }`,
            })}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClick}
            py="two"
            mr="xs"
        >
            <Grid.Col span={'content'}>
                <MantineIcon
                    icon={
                        // TODO: Add icon for field type and for subtype
                        field.fieldType === FieldType.DIMENSION
                            ? IconAbc
                            : Icon123
                    }
                    // TODO: Add icon for field type and for subtype
                    color={
                        field.fieldType === FieldType.DIMENSION
                            ? 'blue'
                            : 'orange'
                    }
                />
            </Grid.Col>

            <Grid.Col span={10}>
                <Highlight
                    highlight={searchString}
                    highlightColor="yellow"
                    fw={500}
                    fz="sm"
                >
                    {field.label ?? ''}
                </Highlight>
            </Grid.Col>

            <Grid.Col span={'auto'}>
                {!isSelected ? (
                    <Highlight
                        fz="13px"
                        w="auto"
                        c="gray.7"
                        lineClamp={2}
                        highlight={searchString}
                        highlightColor="yellow"
                    >
                        {field.description || ''}
                    </Highlight>
                ) : (
                    <Badge color="violet">previewing</Badge>
                )}
            </Grid.Col>
            {(hovered || isSelected) && (
                <Box
                    pos={'absolute'}
                    right={10}
                    sx={{
                        zIndex: 20,
                    }}
                >
                    <MantineLinkButton
                        size="xs"
                        href={exploreWithFieldUrl}
                        compact
                        sx={(theme) => ({
                            backgroundColor: theme.colors.gray[8],
                            '&:hover': {
                                backgroundColor: theme.colors.gray[9],
                            },
                        })}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTable(field.tableName);
                            if (field.tableName !== chartDraft.tableName) {
                                setExplorerUrlState(undefined);
                            } else {
                                setExplorerUrlState(chartDraft);
                            }
                            setIsViewingCatalog(false);
                            setHasSelectedField(true);
                        }}
                    >
                        Use field
                    </MantineLinkButton>
                </Box>
            )}
        </Grid>
    );
};
