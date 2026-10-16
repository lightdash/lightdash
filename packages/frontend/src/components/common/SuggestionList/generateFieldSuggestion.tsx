import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isMetric,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { type MentionOptions } from '@tiptap/extension-mention';
import i18n from '../../../i18n/i18n';
import FieldIcon from '../Filters/FieldIcon';
import { PolymorphicGroupButton } from '../PolymorphicGroupButton';
import { createFieldSuggestionMatch } from './findFieldSuggestionMatch';
import { generateSuggestion } from './generateSuggestion';
import suggestionStyles from './SuggestionList.module.css';

export type FieldSuggestionItem = {
    id: string;
    label: string;
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
};

type FieldSuggestionGroup = 'dimensions' | 'metrics' | 'tableCalcs';

const getFieldSuggestionGroupLabels = (): Record<
    FieldSuggestionGroup,
    string
> => ({
    dimensions: i18n.t('suggestionList.groups.dimensions', { ns: 'commonUi' }),
    metrics: i18n.t('suggestionList.groups.metrics', { ns: 'commonUi' }),
    tableCalcs: i18n.t('suggestionList.groups.tableCalculations', {
        ns: 'commonUi',
    }),
});

const GROUP_ORDER: FieldSuggestionGroup[] = [
    'dimensions',
    'metrics',
    'tableCalcs',
];

const getFieldSuggestionGroup = (
    item: FieldSuggestionItem['item'],
): FieldSuggestionGroup => {
    if (isCustomDimension(item) || isDimension(item)) return 'dimensions';
    if (isMetric(item) || isAdditionalMetric(item)) return 'metrics';
    return 'tableCalcs';
};

/** Stable-sorts fields so groups render contiguously (dimensions → metrics → table calcs). */
export const sortFieldSuggestions = (
    fields: FieldSuggestionItem[],
): FieldSuggestionItem[] =>
    fields.toSorted(
        (a, b) =>
            GROUP_ORDER.indexOf(getFieldSuggestionGroup(a.item)) -
            GROUP_ORDER.indexOf(getFieldSuggestionGroup(b.item)),
    );

export const generateFieldSuggestion = (
    fields: FieldSuggestionItem[],
): MentionOptions['suggestion'] => {
    const sortedFields = sortFieldSuggestions(fields);
    return {
        ...generateSuggestion({
            items: sortedFields,
            command: ({ editor, range, props }) => {
                const suggestion = props as FieldSuggestionItem;
                editor
                    .chain()
                    .focus()
                    .insertContentAt(range, [
                        {
                            type: 'mention',
                            attrs: {
                                id: suggestion.id,
                                label: suggestion.label,
                            },
                        },
                        { type: 'text', text: ' ' },
                    ])
                    .run();
            },
            getGroupKey: (item) =>
                getFieldSuggestionGroup((item as FieldSuggestionItem).item),
            groupLabels: getFieldSuggestionGroupLabels(),
            renderItem: (item, isSelected, onClick) => (
                <PolymorphicGroupButton
                    onClick={onClick}
                    className={suggestionStyles.suggestionItem}
                    data-selected={isSelected}
                >
                    <Group wrap="nowrap" gap="xs">
                        <FieldIcon
                            item={(item as FieldSuggestionItem).item}
                            size="sm"
                        />
                        <Text size="xs" truncate maw={500} fw={400}>
                            {item.label}
                        </Text>
                    </Group>
                </PolymorphicGroupButton>
            ),
            emptyMessage: i18n.t('suggestionList.noFields', { ns: 'commonUi' }),
        }),
        allowSpaces: true,
        findSuggestionMatch: createFieldSuggestionMatch(
            sortedFields.map((field) => field.label),
        ),
    };
};
