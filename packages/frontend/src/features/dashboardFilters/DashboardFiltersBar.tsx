import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Drawer,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsHorizontal,
    IconCalendar,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconFilter,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../components/common/MantineIcon';
import { useCompactContentHeader } from '../../components/common/Page/useCompactContentHeader';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { DateZoom } from '../dateZoom';
import { Parameters } from '../parameters';
import classes from './DashboardFiltersBar.module.css';
import FilterGroupSeparator from './FilterGroupSeparator';
import FilterRequirementsButton from './FilterRequirements/FilterRequirementsButton';
import DashboardFilters from './index';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    hasTilesThatSupportFilters: boolean;
    hasDashboardTiles: boolean;
    parameters: Record<string, LightdashProjectParameter>;
    shadowedReservedNames: string[];
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterPin: (parameterKey: string) => void;
    parameterOrder: string[];
    onParameterReorder: (order: string[]) => void;
    isDateZoomDisabled: boolean;
    onCollapse: () => void;
    /** Replaces the filters and the requirements button. Defaults to both. */
    filterArea?: ReactNode;
};

export const DashboardFiltersBar: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    hasTilesThatSupportFilters,
    hasDashboardTiles,
    parameters,
    shadowedReservedNames,
    parameterValues,
    onParameterChange,
    onParameterClearAll,
    isParameterLoading,
    missingRequiredParameters,
    pinnedParameters,
    onParameterPin,
    parameterOrder,
    onParameterReorder,
    isDateZoomDisabled,
    onCollapse,
    filterArea,
}) => {
    const compact = useCompactContentHeader();
    const [opened, { open, close }] = useDisclosure(false);
    const getUiString = useUiStrings();
    const { t } = useTranslation('dashboardFilters');
    const isAddFilterDisabled = useDashboardContext(
        (c) => c.isAddFilterDisabled,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const hasFilters =
        allFilters.dimensions.length > 0 ||
        allFilters.metrics.length > 0 ||
        allFilters.tableCalculations.length > 0;
    const hasParameters = Object.keys(parameters).length > 0;

    const parametersSeparator: ReactNode = (
        <FilterGroupSeparator
            icon={IconAdjustmentsHorizontal}
            tooltipLabel={
                <Box>
                    <Text fw={500} fz="xs">
                        {t('bar.parameters.title')}
                    </Text>
                    <Text fz="xs">{t('bar.parameters.description')}</Text>
                </Box>
            }
        />
    );

    const renderFilters = !isAddFilterDisabled || isEditMode || hasFilters;

    const content = (
        <div className={classes.content}>
            <Group
                className={classes.bar}
                justify="space-between"
                align="flex-start"
                wrap={compact ? 'wrap' : 'nowrap'}
                px="lg"
                py="xxs"
                // Walkthrough: a look at the filter bar on the way to the
                // date zoom (view:Dashboard). See scripts/scope-tours.
                data-tour-scope="view:Dashboard"
                data-tour-look="1"
                data-tour-after='[data-tour-anchor="dashboard-row"][data-tour-value="Jaffle Shop overview"]'
                data-tour-label="Filters sit at the top"
                data-tour-docs="explore/dashboards/interact.mdx#filter-the-dashboard:1-2"
            >
                {/* Left section - filters and parameters */}
                <Group
                    justify="space-between"
                    align="flex-start"
                    wrap={compact ? 'wrap' : 'nowrap'}
                    grow
                >
                    {hasTilesThatSupportFilters && (
                        <Group
                            className={classes.filters}
                            align="flex-start"
                            gap="xs"
                            wrap="wrap"
                        >
                            {renderFilters && (
                                <FilterGroupSeparator
                                    icon={IconFilter}
                                    tooltipLabel={
                                        <Box>
                                            <Text fw={500} fz="xs">
                                                {t('bar.filters.title')}
                                            </Text>
                                            <Text fz="xs">
                                                {t('bar.filters.description')}
                                            </Text>
                                        </Box>
                                    }
                                />
                            )}
                            {filterArea ?? (
                                <>
                                    <DashboardFilters
                                        isEditMode={isEditMode}
                                        activeTabUuid={activeTabUuid}
                                    />

                                    {isEditMode && <FilterRequirementsButton />}
                                </>
                            )}

                            {hasDashboardTiles && hasParameters && (
                                <>
                                    {renderFilters && (
                                        <Divider orientation="vertical" />
                                    )}

                                    <Parameters
                                        isEditMode={isEditMode}
                                        parameterValues={parameterValues}
                                        onParameterChange={onParameterChange}
                                        onClearAll={onParameterClearAll}
                                        parameters={parameters}
                                        shadowedReservedNames={
                                            shadowedReservedNames
                                        }
                                        isLoading={isParameterLoading}
                                        missingRequiredParameters={
                                            missingRequiredParameters
                                        }
                                        pinnedParameters={pinnedParameters}
                                        onParameterPin={onParameterPin}
                                        parameterOrder={parameterOrder}
                                        onParameterReorder={onParameterReorder}
                                        separator={
                                            compact
                                                ? undefined
                                                : parametersSeparator
                                        }
                                    />
                                </>
                            )}
                        </Group>
                    )}
                </Group>

                {/* Right section - date zoom and hide button */}
                <Group gap="xs" ml="auto" wrap={compact ? 'wrap' : 'nowrap'}>
                    {hasDashboardTiles &&
                        (!isDateZoomDisabled || isEditMode) && (
                            <>
                                <Divider orientation="vertical" />

                                <FilterGroupSeparator
                                    icon={IconCalendar}
                                    tooltipLabel={
                                        <Box>
                                            <Text fw={500} fz="xs">
                                                {t('bar.dateZoom.title')}
                                            </Text>
                                            <Text fz="xs">
                                                {t('bar.dateZoom.description')}
                                            </Text>
                                        </Box>
                                    }
                                />
                                {isEditMode && (
                                    <Tooltip
                                        label={
                                            isDateZoomDisabled
                                                ? t(
                                                      'bar.dateZoom.hiddenFromViewers',
                                                  )
                                                : t(
                                                      'bar.dateZoom.hideFromViewers',
                                                  )
                                        }
                                    >
                                        <ActionIcon
                                            aria-label={t(
                                                'bar.dateZoom.toggleVisibility',
                                            )}
                                            onClick={() =>
                                                setIsDateZoomDisabled(
                                                    !isDateZoomDisabled,
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                color="dimmed"
                                                icon={
                                                    isDateZoomDisabled
                                                        ? IconEyeOff
                                                        : IconEye
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                                <DateZoom isEditMode={isEditMode} />
                            </>
                        )}

                    {/* Hide button - only in view mode */}
                    {!isEditMode && !compact && (
                        <>
                            <Divider orientation="vertical" />
                            <Tooltip label={t('bar.hideFilters')}>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    rightSection={
                                        <MantineIcon icon={IconChevronUp} />
                                    }
                                    onClick={onCollapse}
                                >
                                    {t('bar.hide')}
                                </Button>
                            </Tooltip>
                        </>
                    )}
                </Group>
            </Group>
        </div>
    );

    if (!compact || isEditMode) return content;

    return (
        <Box px="sm" py="xs">
            <Button
                variant="default"
                onClick={open}
                leftSection={<MantineIcon icon={IconFilter} />}
                aria-expanded={opened}
            >
                {getUiString('filters.panel.title')}
            </Button>
            <Drawer
                opened={opened}
                onClose={close}
                title={getUiString('filters.panel.title')}
                closeButtonProps={{
                    'aria-label': getUiString('filters.panel.close'),
                    size: 44,
                }}
                position="bottom"
                size="85dvh"
                classNames={{
                    content: classes.drawerContent,
                    body: classes.drawerBody,
                }}
            >
                {content}
            </Drawer>
        </Box>
    );
};
