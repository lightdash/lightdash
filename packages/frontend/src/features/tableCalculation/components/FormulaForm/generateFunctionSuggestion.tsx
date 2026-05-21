import type { FunctionDefinition } from '@lightdash/formula';
import { Group, Text } from '@mantine-8/core';
import { IconMathFunction } from '@tabler/icons-react';
import { type MentionOptions } from '@tiptap/extension-mention';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../components/common/PolymorphicGroupButton';
import { generateSuggestion } from '../../../../components/common/SuggestionList';
import suggestionStyles from '../../../../components/common/SuggestionList/SuggestionList.module.css';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    type FunctionCategory,
} from './functionCategories';

export type FunctionSuggestionItem = {
    id: string;
    label: string;
    description: string;
    definition: FunctionDefinition;
};

const sortByCategory = (
    items: FunctionSuggestionItem[],
): FunctionSuggestionItem[] => {
    const orderIndex = (cat: FunctionCategory) => {
        const idx = CATEGORY_ORDER.indexOf(cat);
        return idx === -1 ? CATEGORY_ORDER.length : idx;
    };
    return [...items].sort((a, b) => {
        const diff =
            orderIndex(a.definition.category) -
            orderIndex(b.definition.category);
        if (diff !== 0) return diff;
        return a.label.localeCompare(b.label);
    });
};

export const generateFunctionSuggestion = (
    functions: FunctionSuggestionItem[],
): MentionOptions['suggestion'] => ({
    ...generateSuggestion({
        items: sortByCategory(functions),
        command: ({ editor, range, props }) => {
            const fn = props as FunctionSuggestionItem;
            editor
                .chain()
                .focus()
                .insertContentAt(range, [{ type: 'text', text: `${fn.id}(` }])
                .run();
        },
        getGroupKey: (item) =>
            (item as FunctionSuggestionItem).definition.category,
        groupLabels: CATEGORY_LABELS,
        renderItem: (item, isSelected, onClick) => (
            <PolymorphicGroupButton
                onClick={onClick}
                className={suggestionStyles.suggestionItem}
                data-selected={isSelected}
            >
                <Group wrap="nowrap" gap="xs">
                    <MantineIcon
                        icon={IconMathFunction}
                        size="sm"
                        color="indigo.4"
                    />
                    <Text size="xs" fw={500}>
                        {item.label}
                    </Text>
                    <Text
                        size="xs"
                        truncate
                        maw={200}
                        className={suggestionStyles.itemDescription}
                    >
                        {(item as FunctionSuggestionItem).description}
                    </Text>
                </Group>
            </PolymorphicGroupButton>
        ),
        emptyMessage: 'No functions found',
    }),
    char: '#',
    allowedPrefixes: null,
});
