import type { FunctionDefinition } from '@lightdash/formula';
import { Group, Text } from '@mantine-8/core';
import { IconMathFunction } from '@tabler/icons-react';
import { type MentionOptions } from '@tiptap/extension-mention';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../components/common/PolymorphicGroupButton';
import { generateSuggestion } from '../../../../components/common/SuggestionList';
import suggestionStyles from '../../../../components/common/SuggestionList/SuggestionList.module.css';

export type FunctionSuggestionItem = {
    id: string;
    label: string;
    description: string;
    definition: FunctionDefinition;
};

export const generateFunctionSuggestion = (
    functions: FunctionSuggestionItem[],
): MentionOptions['suggestion'] => ({
    ...generateSuggestion({
        items: functions,
        command: ({ editor, range, props }) => {
            const fn = props as FunctionSuggestionItem;
            editor
                .chain()
                .focus()
                .insertContentAt(range, [{ type: 'text', text: `${fn.id}(` }])
                .run();
        },
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
                        color="violet"
                    />
                    <Text size="xs" fw={500}>
                        {item.label}
                    </Text>
                    <Text size="xs" c="dimmed" truncate maw={200}>
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
