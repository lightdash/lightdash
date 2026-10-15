import { type FilterableField, type FilterRule } from '@lightdash/common';
import { Stack, Text, Tooltip } from '@mantine/core';
import { memo, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterRuleForm from './FilterRuleForm';

type Props = {
    fields: FilterableField[];
    filterRules: FilterRule[];
    isEditMode: boolean;
    onChange: (value: FilterRule[]) => void;
};

const SimplifiedFilterGroupForm: FC<Props> = memo(
    ({ isEditMode, fields, filterRules, onChange }) => {
        const { t } = useTranslation('filters');
        const onDeleteItem = useCallback(
            (index: number) => {
                onChange([
                    ...filterRules.slice(0, index),
                    ...filterRules.slice(index + 1),
                ]);
            },
            [filterRules, onChange],
        );

        const onChangeItem = useCallback(
            (index: number, item: FilterRule) => {
                onChange([
                    ...filterRules.slice(0, index),
                    item,
                    ...filterRules.slice(index + 1),
                ]);
            },
            [filterRules, onChange],
        );

        return (
            <Stack flex={1}>
                <Tooltip
                    label={t('simplifiedGroup.andOnlyTooltip')}
                    disabled={filterRules.length > 1}
                    arrowPosition="center"
                >
                    <Text c="dimmed" fz="xs">
                        {t('simplifiedGroup.allConditionsMatch')}
                    </Text>
                </Tooltip>

                <Stack gap="sm">
                    {filterRules.map((item, index) => (
                        <FilterRuleForm
                            isEditMode={isEditMode}
                            key={item.id}
                            filterRule={item}
                            fields={fields}
                            onChange={(value) => onChangeItem(index, value)}
                            onDelete={() => onDeleteItem(index)}
                        />
                    ))}
                </Stack>
            </Stack>
        );
    },
);

SimplifiedFilterGroupForm.displayName = 'SimplifiedFilterGroupForm';

export default SimplifiedFilterGroupForm;
