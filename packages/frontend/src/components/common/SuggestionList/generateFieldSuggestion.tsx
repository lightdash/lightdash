import {
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Group, Text } from '@mantine-8/core';
import { type MentionOptions } from '@tiptap/extension-mention';
import FieldIcon from '../Filters/FieldIcon';
import { PolymorphicGroupButton } from '../PolymorphicGroupButton';
import { generateSuggestion } from './generateSuggestion';
import suggestionStyles from './SuggestionList.module.css';

export type FieldSuggestionItem = {
    id: string;
    label: string;
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
};

export const generateFieldSuggestion = (
    fields: FieldSuggestionItem[],
): MentionOptions['suggestion'] =>
    generateSuggestion({
        items: fields,
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
        emptyMessage: 'No fields found',
    });
