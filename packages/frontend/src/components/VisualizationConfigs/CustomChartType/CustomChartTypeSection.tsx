import { type DataAppViz } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    /** Null hides the built-in Vega option. */
    onSelectVega: (() => void) | null;
    onSelectProjectType: (dataAppViz: DataAppViz) => void;
    /** Null where an empty selection is not a state the caller can be left in. */
    onClear: (() => void) | null;
    /** Opens the chart type builder; null hides the create action. */
    onCreateNew: (() => void) | null;
    /** Opens the chart type gallery; null hides the action. */
    onBrowseGallery: (() => void) | null;
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
    onSelectVega,
    onSelectProjectType,
    onClear,
    onCreateNew,
    onBrowseGallery,
}) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Config>
            <Config.Section>
                <Config.Heading>{t('customChartType.heading')}</Config.Heading>
                <CustomChartTypePicker
                    projectUuid={projectUuid}
                    selected={selected}
                    selectedDataAppViz={selectedDataAppViz}
                    disabled={!hasColumns}
                    onSelectVega={onSelectVega}
                    onSelectProjectType={onSelectProjectType}
                    onClear={onClear}
                    onCreateNew={onCreateNew}
                    onBrowseGallery={onBrowseGallery}
                />
                {!hasColumns && (
                    <Text c="dimmed" size="xs">
                        {t('customChartType.runQueryHint')}
                    </Text>
                )}
            </Config.Section>
        </Config>
    );
};

export default CustomChartTypeSection;
