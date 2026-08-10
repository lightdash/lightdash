import { type DataAppViz } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { type DataAppVizDraftOption } from '../../../features/apps/dataAppVizDraft';
import { Config } from '../common/Config';
import { type CustomChartTypeOption } from './customChartTypeOption';
import CustomChartTypePicker from './CustomChartTypePicker';

type Props = {
    projectUuid: string;
    selected: CustomChartTypeOption | null;
    selectedDataAppViz: DataAppViz | null;
    /** Auto-binding only runs at pick time, so picking before the query has
     *  columns would leave the slots empty for good. */
    hasColumns: boolean;
    draft: DataAppVizDraftOption | null;
    onSelectVega: () => void;
    onSelectProjectType: (dataAppViz: DataAppViz) => void;
    onSelectDraft: () => void;
    /** Null where describing a new type is not on offer. */
    onClear: (() => void) | null;
};

/**
 * Which custom chart type the chart is on. It sits above the option tabs rather
 * than inside `General`, because it decides what those tabs contain — the tabs
 * are the selected type's own options.
 */
const CustomChartTypeSection: FC<Props> = ({
    projectUuid,
    selected,
    selectedDataAppViz,
    hasColumns,
    draft,
    onSelectVega,
    onSelectProjectType,
    onSelectDraft,
    onClear,
}) => (
    <Config>
        <Config.Section>
            <Config.Heading>Custom chart type</Config.Heading>
            <CustomChartTypePicker
                projectUuid={projectUuid}
                selected={selected}
                selectedDataAppViz={selectedDataAppViz}
                disabled={!hasColumns}
                draft={draft}
                onSelectVega={onSelectVega}
                onSelectProjectType={onSelectProjectType}
                onSelectDraft={onSelectDraft}
                onClear={onClear}
            />
            {!hasColumns && (
                <Text c="dimmed" size="xs">
                    Run your query to pick a custom chart type.
                </Text>
            )}
        </Config.Section>
    </Config>
);

export default CustomChartTypeSection;
