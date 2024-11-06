import { type CatalogField } from '@lightdash/common';
import { Button } from '@mantine/core';
import { type MRT_Row } from 'mantine-react-table';
import { useState } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import {
    createMetricPreviewUnsavedChartVersion,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';

type Props = {
    row: MRT_Row<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const [isGeneratingPreviewUrl, setIsGeneratingPreviewUrl] = useState(false);
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const [currentTableName, setCurrentTableName] = useState<string>();
    const { track } = useTracking();
    const { isFetching } = useExplore(currentTableName, {
        onSuccess(explore) {
            if (!!currentTableName && explore && projectUuid) {
                setIsGeneratingPreviewUrl(true);
                const unsavedChartVersion =
                    createMetricPreviewUnsavedChartVersion(
                        row.original,
                        explore,
                    );

                const { pathname, search } =
                    getExplorerUrlFromCreateSavedChartVersion(
                        projectUuid,
                        unsavedChartVersion,
                    );
                const url = new URL(pathname, window.location.origin);
                url.search = new URLSearchParams(search).toString();

                window.open(url.href, '_blank');
                setIsGeneratingPreviewUrl(false);
                setCurrentTableName(undefined);
            }
        },
    });

    const handleExploreClick = () => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                metricName: row.original.name,
                tableName: row.original.tableName,
            },
        });
        setCurrentTableName(row.original.tableName);
    };

    return (
        <Button
            size="xs"
            compact
            variant="subtle"
            onClick={handleExploreClick}
            loading={isFetching || isGeneratingPreviewUrl}
        >
            Explore
        </Button>
    );
};
