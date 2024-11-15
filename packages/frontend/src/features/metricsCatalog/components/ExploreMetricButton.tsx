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
    className?: string;
    visibility?: 'visible' | 'hidden';
    row: MRT_Row<CatalogField>;
};

export const ExploreMetricButton = ({ row, visibility, className }: Props) => {
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
            className={className}
            size="xs"
            compact
            bg="linear-gradient(180deg, #202B37 0%, #151C24 100%)"
            radius="md"
            onClick={handleExploreClick}
            loading={isFetching || isGeneratingPreviewUrl}
            py="xxs"
            px={10}
            sx={{
                border: `1px solid #414E62`,
                boxShadow: '0px 0px 0px 1px #151C24',
                visibility,
            }}
        >
            Explore
        </Button>
    );
};
