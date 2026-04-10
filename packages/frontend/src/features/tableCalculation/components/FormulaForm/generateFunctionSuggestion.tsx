import type { FunctionDefinition } from '@lightdash/formula';
import { Group, Stack, Text } from '@mantine-8/core';
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
    tooltipMap?: Map<string, string>,
): MentionOptions['suggestion'] => ({
    ...generateSuggestion({
        items: functions,
        command: ({ editor, range, props }) => {
            const fn = props as FunctionSuggestionItem;
            const tooltip = tooltipMap?.get(fn.id) ?? null;
            editor
                .chain()
                .focus()
                .insertContentAt(range, [
                    {
                        type: 'functionMention',
                        attrs: { id: fn.id, label: fn.label, tooltip },
                    },
                    { type: 'text', text: '(' },
                ])
                .run();
        },
        renderItem: (item, isSelected, onClick) => {
            const fnItem = item as FunctionSuggestionItem;
            return (
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
                        <Stack gap={0}>
                            <Group wrap="nowrap" gap="xs">
                                <Text size="xs" fw={500}>
                                    {fnItem.label}
                                </Text>
                                <Text size="xs" c="dimmed" truncate maw={200}>
                                    {fnItem.description}
                                </Text>
                            </Group>
                            <Text
                                size="xs"
                                c="dimmed"
                                ff="monospace"
                                opacity={0.7}
                            >
                                {fnItem.definition.example}
                            </Text>
                        </Stack>
                    </Group>
                </PolymorphicGroupButton>
            );
        },
        emptyMessage: 'No functions found',
    }),
    char: '#',
    allowedPrefixes: null,
});
