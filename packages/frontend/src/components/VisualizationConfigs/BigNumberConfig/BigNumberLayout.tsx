import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Group, Select, Tooltip } from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconTable,
    IconTableOff,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { LabelEditor } from '../common/LabelEditor';
import { getStyleOptions } from './common';

export const Layout: FC = () => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const styleOptions = useMemo(
        () => getStyleOptions(t('state.none', { ns: 'common' })),
        [t],
    );

    if (!isBigNumberVisualizationConfig(visualizationConfig)) return null;

    const {
        bigNumberLabel,
        defaultLabel,
        setBigNumberLabel,
        bigNumberStyle,
        setBigNumberStyle,
        setBigNumberComparisonStyle,
        showStyle,
        selectedField: selectedFieldId,
        setSelectedField,
        getField,
        showBigNumberLabel,
        setShowBigNumberLabel,
        showTableNamesInLabel,
        setShowTableNamesInLabel,
        granularityFields,
    } = visualizationConfig.chartConfig;

    const selectedField = getField(selectedFieldId);

    return (
        <Config>
            <Config.Section>
                <Config.Heading>{t('bigNumber.layout.field')}</Config.Heading>
                <FieldSelect
                    label={t('bigNumber.layout.selectedField')}
                    item={selectedField}
                    items={Object.values(itemsMap ?? {})}
                    onChange={(newValue) => {
                        setSelectedField(
                            newValue ? getItemId(newValue) : undefined,
                        );
                    }}
                    hasGrouping
                />

                {showStyle && (
                    <Select
                        label={t('bigNumber.layout.format')}
                        data={styleOptions}
                        value={bigNumberStyle ?? ''}
                        onChange={(newValue) => {
                            if (!newValue) {
                                setBigNumberStyle(undefined);
                                setBigNumberComparisonStyle(undefined);
                            } else {
                                setBigNumberStyle(newValue as CompactOrAlias);
                                setBigNumberComparisonStyle(
                                    newValue as CompactOrAlias,
                                );
                            }
                        }}
                    />
                )}

                <Group gap="xs" align="flex-start" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                        <LabelEditor
                            label={t('bigNumber.layout.label')}
                            value={bigNumberLabel ?? ''}
                            placeholder={defaultLabel}
                            onChange={setBigNumberLabel}
                            fields={granularityFields}
                            readOnly={!showBigNumberLabel}
                        />
                    </div>

                    <Group gap={4} wrap="nowrap" mt={25}>
                        <Tooltip
                            label={
                                bigNumberLabel
                                    ? t('bigNumber.layout.clearCustomLabel')
                                    : showTableNamesInLabel
                                      ? t('bigNumber.layout.hideTableNames')
                                      : t('bigNumber.layout.showTableNames')
                            }
                        >
                            <ActionIcon
                                onClick={() => {
                                    if (!bigNumberLabel) {
                                        setShowTableNamesInLabel(
                                            !showTableNamesInLabel,
                                        );
                                    }
                                }}
                                disabled={!!bigNumberLabel}
                            >
                                <MantineIcon
                                    icon={
                                        showTableNamesInLabel
                                            ? IconTable
                                            : IconTableOff
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <ActionIcon
                            onClick={() => {
                                setShowBigNumberLabel(!showBigNumberLabel);
                            }}
                        >
                            <MantineIcon
                                icon={showBigNumberLabel ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    </Group>
                </Group>
            </Config.Section>
        </Config>
    );
};
