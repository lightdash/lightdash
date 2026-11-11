import { type DateZoomControl } from '@lightdash/common';
import { Paper } from '@mantine/core';
import { useState, type FC } from 'react';
import {
    selectControlSections,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { DateZoomControlPopover } from '../../features/dashboardControls/DateZoomControlPopover';
import { DefaultZoomPopover } from '../../features/dashboardControls/DefaultZoomPopover';
import { type EditorView as PopoverView } from '../../features/dashboardControls/FilterPopover';
import { customGranularityLabels, TOTAL_TILE_COUNT } from './fixtures';

// The popovers keep their own draft; Cancel remounts them, as reopening would

type StatefulDateZoomPopoverProps = {
    initialControl: DateZoomControl;
    granularities: string[];
    isViewer: boolean;
    isNew: boolean;
    tileCount: number;
    /** A viewer's pick; null: the saved grain. */
    viewerGranularity: string | null;
    initialView: PopoverView;
    onApply: (control: DateZoomControl) => void;
    onViewerApply: (granularity: string | null) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
};

export const StatefulDateZoomPopover: FC<StatefulDateZoomPopoverProps> = ({
    initialControl,
    granularities,
    isViewer,
    isNew,
    tileCount,
    viewerGranularity,
    initialView,
    onApply,
    onViewerApply,
    onCancel,
    onChooseTiles,
}) => {
    const sections = useDashboardSelector(selectControlSections);
    const [opening, setOpening] = useState(0);
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <DateZoomControlPopover
                key={opening}
                control={initialControl}
                granularities={granularities}
                customLabels={customGranularityLabels}
                mode={
                    isViewer
                        ? {
                              kind: 'viewer',
                              granularity: viewerGranularity,
                              onApply: onViewerApply,
                          }
                        : {
                              kind: 'editor',
                              isNew,
                              sections,
                              tileCount,
                              totalTileCount: TOTAL_TILE_COUNT,
                              initialView,
                              onChooseTiles,
                              onApply,
                          }
                }
                onCancel={() => {
                    setOpening((count) => count + 1);
                    onCancel();
                }}
            />
        </Paper>
    );
};

type StatefulDefaultZoomPopoverProps = {
    enabledGranularities: string[];
    defaultGranularity: string | null;
    isViewer: boolean;
    /** Zoomable tiles in no named zoom. */
    tileCount: number;
    viewerGranularity: string | null;
    onApply: (next: { defaultGranularity: string | null }) => void;
    onViewerApply: (granularity: string | null) => void;
    onCancel: () => void;
};

export const StatefulDefaultZoomPopover: FC<
    StatefulDefaultZoomPopoverProps
> = ({
    enabledGranularities,
    defaultGranularity,
    isViewer,
    tileCount,
    viewerGranularity,
    onApply,
    onViewerApply,
    onCancel,
}) => {
    const [opening, setOpening] = useState(0);
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <DefaultZoomPopover
                key={opening}
                enabledGranularities={enabledGranularities}
                defaultGranularity={defaultGranularity}
                customLabels={customGranularityLabels}
                mode={
                    isViewer
                        ? {
                              kind: 'viewer',
                              granularity: viewerGranularity,
                              onApply: onViewerApply,
                          }
                        : { kind: 'editor', tileCount, onApply }
                }
                onCancel={() => {
                    setOpening((count) => count + 1);
                    onCancel();
                }}
            />
        </Paper>
    );
};
