import {
    ChartType,
    getDimensions,
    getItemId,
    hashFieldReference,
    isField,
    type CompiledDimension,
    type CreateSavedChartVersion,
    type FieldId,
    type Filters,
    type MetricQuery,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconArrowBarToDown, IconExternalLink } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import FieldSelect from '../common/FieldSelect';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { combineFilters } from './drillDownFilters';
import type { TopGroupTuple } from './types';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

type DrillDownExploreUrlArgs = {
    fieldValues: Record<string, ResultValue>;
    projectUuid: string;
    tableName: string;
    metricQuery: MetricQuery;
    drillByMetric: FieldId;
    drillByDimension: FieldId;
    extraFilters?: Filters;
    pivotReference?: PivotReference;
    topGroupTuples?: TopGroupTuple[];
};

const drillDownExploreUrl = ({
    fieldValues,
    projectUuid,
    tableName,
    metricQuery,
    drillByMetric,
    drillByDimension,
    extraFilters,
    pivotReference,
    topGroupTuples,
}: DrillDownExploreUrlArgs) => {
    const createSavedChartVersion: CreateSavedChartVersion = {
        tableName,
        metricQuery: {
            exploreName: tableName,
            tableCalculations: [],
            dimensions: [drillByDimension],
            metrics: [drillByMetric],
            filters: combineFilters({
                metricQuery,
                fieldValues,
                extraFilters,
                pivotReference,
                topGroupTuples,
            }),
            limit: 500,
            additionalMetrics: metricQuery.additionalMetrics,
            customDimensions: metricQuery.customDimensions,
            sorts: [
                {
                    fieldId: drillByDimension,
                    descending: false,
                },
            ],
        },
        pivotConfig: undefined,
        tableConfig: {
            columnOrder: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        },
    };
    const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        createSavedChartVersion,
    );
    return `${pathname}?${search}`;
};

export const DrillDownModal: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [selectedDimension, setSelectedDimension] =
        useState<CompiledDimension>();

    const {
        isDrillDownModalOpen,
        closeDrillDownModal,
        explore,
        metricQuery,
        drillDownConfig,
    } = useMetricQueryDataContext();

    const dimensionsAvailable = useMemo(() => {
        if (!explore) return [];

        return getDimensions(explore).filter((dimension) => !dimension.hidden);
    }, [explore]);

    const value = useMemo(() => {
        if (drillDownConfig && isField(drillDownConfig.item)) {
            const fieldId =
                drillDownConfig.pivotReference !== undefined
                    ? hashFieldReference(drillDownConfig.pivotReference)
                    : getItemId(drillDownConfig.item);
            return drillDownConfig.fieldValues[fieldId]?.formatted;
        }
    }, [drillDownConfig]);

    const url = useMemo(() => {
        if (
            selectedDimension &&
            metricQuery &&
            explore &&
            drillDownConfig &&
            projectUuid
        ) {
            return drillDownExploreUrl({
                projectUuid,
                tableName: explore.name,
                metricQuery,
                fieldValues: drillDownConfig.fieldValues,
                drillByMetric: getItemId(drillDownConfig.item),
                drillByDimension: getItemId(selectedDimension),
                pivotReference: drillDownConfig.pivotReference,
                topGroupTuples: drillDownConfig.topGroupTuples,
            });
        }
    }, [selectedDimension, metricQuery, explore, drillDownConfig, projectUuid]);

    const onClose = useCallback(() => {
        setSelectedDimension(undefined);
        closeDrillDownModal();
    }, [closeDrillDownModal]);

    return (
        <MantineModal
            opened={isDrillDownModalOpen}
            onClose={onClose}
            title={`Drill into "${value}"`}
            size="md"
            icon={IconArrowBarToDown}
            actions={
                <Button
                    component="a"
                    target="_blank"
                    href={url}
                    leftSection={<MantineIcon icon={IconExternalLink} />}
                    disabled={!selectedDimension}
                    onClick={() => setTimeout(onClose, 500)}
                >
                    Open in new tab
                </Button>
            }
        >
            <FieldSelect
                comboboxProps={{ withinPortal: true }}
                disabled={dimensionsAvailable.length === 0}
                item={selectedDimension}
                items={dimensionsAvailable}
                onChange={setSelectedDimension}
                hasGrouping
            />
        </MantineModal>
    );
};
