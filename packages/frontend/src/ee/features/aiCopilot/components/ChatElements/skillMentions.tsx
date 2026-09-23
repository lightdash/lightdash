import {
    type AgentSkillsListing,
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import { type Editor } from '@tiptap/core';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import {
    SuggestionList,
    type SuggestionListRef,
} from '../../../../../components/common/SuggestionList/SuggestionList';
import suggestionStyles from '../../../../../components/common/SuggestionList/SuggestionList.module.css';
import styles from './AgentChatInput.module.css';
import {
    CLOSED_CONTENT_MENTION_MENU,
    type ContentMentionMenuState,
} from './contentMentions';
import { SkillMentionNodeView } from './SkillMentionNodeView';

export const SKILL_MENTION_NAME = 'skillMention';
const skillMentionPluginKey = new PluginKey('skillMention');

const DOM_RECT_FALLBACK = new DOMRect(0, 0, 0, 0);

export type SkillMentionItem = {
    id: string;
    label: string;
    name: string;
    description: string;
    builtIn: boolean;
    argumentHint: string | null;
    group: 'custom' | 'builtIn';
};

const groupLabels: Record<string, string> = {
    custom: 'Skills',
    builtIn: 'Built-in',
};

export const toSkillMentionItems = (
    listing: AgentSkillsListing | undefined,
): SkillMentionItem[] => {
    if (!listing) return [];
    const custom = listing.skills
        .filter((skill) => skill.userInvocable)
        .map<SkillMentionItem>((skill) => ({
            id: skill.uuid,
            label: `/${skill.name}`,
            name: skill.name,
            description: skill.description,
            builtIn: false,
            argumentHint: skill.argumentHint,
            group: 'custom',
        }));
    const builtIn = listing.builtInSkills.map<SkillMentionItem>((skill) => ({
        id: `builtin:${skill.name}`,
        label: `/${skill.name}`,
        name: skill.name,
        description: skill.description,
        builtIn: true,
        argumentHint: null,
        group: 'builtIn',
    }));
    return [...custom, ...builtIn];
};

const matchesQuery = (item: SkillMentionItem, query: string) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
        item.name.includes(needle) ||
        item.description.toLowerCase().includes(needle)
    );
};

const hasSkillMention = (editor: Editor): boolean => {
    let found = false;
    editor.state.doc.descendants((node) => {
        if (node.type.name === SKILL_MENTION_NAME) found = true;
        return !found;
    });
    return found;
};

export const isSkillMentionSuggestionActive = (editor: Editor | null) => {
    if (!editor) return false;
    const state = skillMentionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
    return state?.active === true;
};

const renderSkillMentionItem = (
    item: SkillMentionItem,
    isSelected: boolean,
    onClick: () => void,
) => (
    <PolymorphicGroupButton
        onClick={onClick}
        className={suggestionStyles.suggestionItem}
        data-selected={isSelected}
    >
        <Stack gap={2} miw={0}>
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={IconBolt} size={12} color="indigo.6" />
                <Text size="sm" fw={500} ff="monospace" truncate>
                    {item.label}
                </Text>
                {item.argumentHint ? (
                    <Text size="xs" c="dimmed" ff="monospace" truncate>
                        {item.argumentHint}
                    </Text>
                ) : null}
                {item.builtIn ? (
                    <Badge size="xs" variant="light" color="yellow">
                        built-in
                    </Badge>
                ) : null}
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
                {item.description}
            </Text>
        </Stack>
    </PolymorphicGroupButton>
);

const generateSkillMentionSuggestion = ({
    getItems,
    onMenuStateChange,
}: {
    getItems: () => SkillMentionItem[];
    onMenuStateChange?: (state: ContentMentionMenuState) => void;
}): MentionOptions['suggestion'] => ({
    char: '/',
    allowSpaces: false,
    // Only at the start of the input or after whitespace, so a URL or a
    // fraction in a sentence never opens the menu.
    allowedPrefixes: [' ', '\n'],
    startOfLine: false,
    pluginKey: skillMentionPluginKey,
    items: ({ query, editor }) => {
        // One skill per message in the first cut.
        if (hasSkillMention(editor)) return [];
        return getItems().filter((item) => matchesQuery(item, query));
    },
    command: ({ editor, range, props }) => {
        const item = props as SkillMentionItem;
        editor
            .chain()
            .focus()
            .insertContentAt(range, [
                {
                    type: SKILL_MENTION_NAME,
                    attrs: {
                        name: item.name,
                        builtIn: item.builtIn,
                        argumentHint: item.argumentHint,
                    },
                },
                { type: 'text', text: ' ' },
            ])
            .run();
    },
    render: () => {
        let component: ReactRenderer<SuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;
        let dismissed = false;
        const listProps = (query: string) => ({
            renderItem: renderSkillMentionItem,
            getGroupKey: (item: SkillMentionItem) => item.group,
            groupLabels,
            emptyMessage: query
                ? `No skill matches "${query}". Keep typing to send as text.`
                : 'No skills available for this agent',
        });

        return {
            onStart: (props) => {
                dismissed = false;
                onMenuStateChange?.({
                    status: 'open',
                    itemCount: props.items.length,
                });
                component = new ReactRenderer(SuggestionList, {
                    props: { ...props, ...listProps(props.query) },
                    editor: props.editor,
                });
                popup = tippy('body', {
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    maxWidth: 'none',
                })[0];
            },
            onUpdate: (props) => {
                if (dismissed) return;
                onMenuStateChange?.({
                    status: 'open',
                    itemCount: props.items.length,
                });
                component?.updateProps({ ...props, ...listProps(props.query) });
                popup?.setProps({
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                });
            },
            onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                    props.event.stopPropagation();
                    dismissed = true;
                    onMenuStateChange?.({ status: 'dismissed' });
                    popup?.hide();
                    return true;
                }
                if (dismissed) return false;
                return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
                dismissed = false;
                onMenuStateChange?.(CLOSED_CONTENT_MENTION_MENU);
                popup?.destroy();
                component?.destroy();
                popup = undefined;
                component = undefined;
            },
        };
    },
});

export const createSkillMentionExtension = ({
    getItems,
    onMenuStateChange,
}: {
    getItems: () => SkillMentionItem[];
    onMenuStateChange?: (state: ContentMentionMenuState) => void;
}) =>
    Mention.extend({
        name: SKILL_MENTION_NAME,
        atom: true,
        addAttributes() {
            return {
                name: { default: null },
                builtIn: { default: false },
                argumentHint: { default: null },
            };
        },
        addKeyboardShortcuts() {
            return {
                Backspace: () =>
                    this.editor.commands.command(({ tr, state }) => {
                        const { selection } = state;
                        const { empty, anchor } = selection;
                        if (!empty || anchor <= 0) return false;
                        let deleted = false;
                        state.doc.nodesBetween(
                            Math.max(0, anchor - 1),
                            anchor,
                            (node, pos) => {
                                if (node.type.name === this.name) {
                                    tr.delete(pos, pos + node.nodeSize);
                                    deleted = true;
                                    return false;
                                }
                            },
                        );
                        return deleted;
                    }),
            };
        },
        addNodeView() {
            return ReactNodeViewRenderer(SkillMentionNodeView);
        },
    }).configure({
        suggestion: generateSkillMentionSuggestion({
            getItems,
            onMenuStateChange,
        }),
        // The prompt text keeps the literal `/name` so the stored message reads
        // as typed; the server never parses it, the context item carries it.
        renderText: ({ node }) =>
            typeof node.attrs.name === 'string' ? `/${node.attrs.name}` : '',
        renderHTML: ({ node }) => [
            'span',
            { class: styles.contentMention, 'data-content-type': 'skill' },
            [
                'span',
                { class: styles.contentMentionLabel },
                typeof node.attrs.name === 'string'
                    ? `/${node.attrs.name}`
                    : '',
            ],
        ],
    });

/**
 * The skill invocation in the composer, if any: the chip names the skill and
 * everything else the user typed is the argument string.
 */
export const extractSkillMentionContext = (
    editor: Editor | null,
    messageText: string,
): {
    context: AiPromptContextInput | undefined;
    optimisticContext: AiPromptContextItem[] | undefined;
} => {
    if (!editor) return { context: undefined, optimisticContext: undefined };
    let name: string | null = null;
    editor.state.doc.descendants((node) => {
        if (node.type.name === SKILL_MENTION_NAME && name === null) {
            name = typeof node.attrs.name === 'string' ? node.attrs.name : null;
        }
        return name === null;
    });
    if (name === null) {
        return { context: undefined, optimisticContext: undefined };
    }
    const skillName: string = name;
    const args = messageText.replace(`/${skillName}`, '').trim();
    return {
        context: [{ type: 'skill', name: skillName, arguments: args }],
        optimisticContext: [
            {
                type: 'skill',
                name: skillName,
                arguments: args,
                skillUuid: null,
                pinnedVersionUuid: null,
                versionNumber: null,
                builtIn: false,
                displayName: null,
            },
        ],
    };
};
