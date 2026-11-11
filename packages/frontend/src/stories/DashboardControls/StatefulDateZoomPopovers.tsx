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

const noop = () => {};

// The draft lives here, as in the editor provider; Cancel starts it over

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
    const [draft, setDraft] = useState(initialControl);
    const [pick, setPick] = useState<string | null>(
        viewerGranularity ?? initialControl.granularity,
    );
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <DateZoomControlPopover
                key={opening}
                control={isViewer ? initialControl : draft}
                granularities={granularities}
                customLabels={customGranularityLabels}
                mode={
                    isViewer
                        ? {
                              kind: 'viewer',
                              granularity: pick,
                              onChange: setPick,
                          }
                        : {
                              kind: 'editor',
                              isNew,
                              sections,
                              tileCount,
                              totalTileCount: TOTAL_TILE_COUNT,
                              initialView,
                              onChooseTiles,
                              onChange: setDraft,
                          }
                }
                isAsking={false}
                onResolvePending={noop}
                onApply={() =>
                    isViewer ? onViewerApply(pick) : onApply(draft)
                }
                onCancel={() => {
                    setOpening((count) => count + 1);
                    setDraft(initialControl);
                    setPick(viewerGranularity ?? initialControl.granularity);
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
    const initialValue = isViewer
        ? (viewerGranularity ?? defaultGranularity)
        : defaultGranularity;
    const [value, setValue] = useState(initialValue);
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <DefaultZoomPopover
                key={opening}
                enabledGranularities={enabledGranularities}
                defaultGranularity={defaultGranularity}
                value={value}
                customLabels={customGranularityLabels}
                mode={
                    isViewer
                        ? { kind: 'viewer' }
                        : { kind: 'editor', tileCount }
                }
                isAsking={false}
                onResolvePending={noop}
                onChange={setValue}
                onApply={() =>
                    isViewer
                        ? onViewerApply(value)
                        : onApply({ defaultGranularity: value })
                }
                onCancel={() => {
                    setOpening((count) => count + 1);
                    setValue(initialValue);
                    onCancel();
                }}
            />
        </Paper>
    );
};
