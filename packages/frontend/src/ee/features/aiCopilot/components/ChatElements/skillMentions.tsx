import {
    interpolateUiString,
    type AgentSkillsListing,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type UiStringResolver,
} from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import { type Editor } from '@tiptap/core';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
import { deleteMentionBeforeCaret } from './mentionBackspace';
import { SkillMentionNodeView } from './SkillMentionNodeView';

export const SKILL_MENTION_NAME = 'skillMention';
const skillMentionPluginKey = new PluginKey('skillMention');
const skillHintPluginKey = new PluginKey('skillMentionHint');

const DOM_RECT_FALLBACK = new DOMRect(0, 0, 0, 0);

export type SkillMentionItem = {
    id: string;
    label: string;
    name: string;
    description: string;
    builtIn: boolean;
    argumentHint: string | null;
};

type SkillMentionGroup = 'custom' | 'builtIn';

const groupOf = (item: SkillMentionItem): SkillMentionGroup =>
    item.builtIn ? 'builtIn' : 'custom';

/** Custom skills a user may invoke from the composer, then the built-ins. */
export const toSkillMentionItems = (
    listing: AgentSkillsListing | undefined,
): SkillMentionItem[] => {
    if (!listing) return [];
    const custom = listing.skills
        .filter(
            (skill) =>
                skill.userInvocable && skill.availability.includes('agent'),
        )
        .map<SkillMentionItem>((skill) => ({
            id: skill.uuid,
            label: `/${skill.name}`,
            name: skill.name,
            description: skill.description,
            builtIn: false,
            argumentHint: skill.argumentHint,
        }));
    const builtIn = listing.builtInSkills.map<SkillMentionItem>((skill) => ({
        id: `builtin:${skill.name}`,
        label: `/${skill.name}`,
        name: skill.name,
        description: skill.description,
        builtIn: true,
        argumentHint: null,
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

const findSkillMention = (
    editor: Editor,
): { name: string; builtIn: boolean } | null => {
    let found: { name: string; builtIn: boolean } | null = null;
    editor.state.doc.descendants((node) => {
        if (node.type.name === SKILL_MENTION_NAME && found === null) {
            found = {
                name:
                    typeof node.attrs.name === 'string' ? node.attrs.name : '',
                builtIn: node.attrs.builtIn === true,
            };
        }
        return found === null;
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

const renderSkillMentionItem =
    (strings: UiStringResolver) =>
    (item: SkillMentionItem, isSelected: boolean, onClick: () => void) => (
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
                        <Badge size="xs" color="yellow">
                            {strings('skillMenu.builtIn')}
                        </Badge>
                    ) : null}
                </Group>
                <Text size="xs" c="dimmed" lineClamp={2}>
                    {item.description}
                </Text>
            </Stack>
        </PolymorphicGroupButton>
    );

type SkillMentionExtensionOptions = {
    getItems: () => SkillMentionItem[];
    /** Off means `/` stays plain text: no menu, no chip, not even for built-ins. */
    getEnabled: () => boolean;
    strings: UiStringResolver;
    onMenuStateChange?: (state: ContentMentionMenuState) => void;
};

const generateSkillMentionSuggestion = ({
    getItems,
    getEnabled,
    strings,
    onMenuStateChange,
}: SkillMentionExtensionOptions): MentionOptions['suggestion'] => ({
    char: '/',
    allowSpaces: false,
    // Only at the start of the input or after whitespace, so a URL or a
    // fraction in a sentence never opens the menu.
    allowedPrefixes: [' '],
    startOfLine: false,
    pluginKey: skillMentionPluginKey,
    allow: () => getEnabled(),
    items: ({ query, editor }) => {
        // One skill per message in the first cut.
        if (findSkillMention(editor)) return [];
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
        const groupLabels: Record<SkillMentionGroup, string> = {
            custom: strings('skillMenu.groupCustom'),
            builtIn: strings('skillMenu.groupBuiltIn'),
        };
        const emptyMessage = (query: string, editor: Editor) => {
            if (findSkillMention(editor)) {
                return strings('skillMenu.onePerMessage');
            }
            return query
                ? interpolateUiString(strings('skillMenu.noMatch'), { query })
                : strings('skillMenu.noneAvailable');
        };
        const listProps = (query: string, editor: Editor) => ({
            renderItem: renderSkillMentionItem(strings),
            getGroupKey: groupOf,
            groupLabels,
            emptyMessage: emptyMessage(query, editor),
        });

        return {
            onStart: (props) => {
                dismissed = false;
                onMenuStateChange?.({
                    status: 'open',
                    itemCount: props.items.length,
                });
                component = new ReactRenderer(SuggestionList, {
                    props: {
                        ...props,
                        ...listProps(props.query, props.editor),
                    },
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
                component?.updateProps({
                    ...props,
                    ...listProps(props.query, props.editor),
                });
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
                // Tab picks the highlighted skill like Enter does.
                const event =
                    props.event.key === 'Tab'
                        ? new KeyboardEvent('keydown', { key: 'Enter' })
                        : props.event;
                return component?.ref?.onKeyDown({ event }) ?? false;
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

/** Ghosts the argument hint after a chip until the user types after it. */
const argumentHintPlugin = () =>
    new Plugin({
        key: skillHintPluginKey,
        props: {
            decorations(state) {
                const decorations: Decoration[] = [];
                state.doc.descendants((node, pos) => {
                    if (node.type.name !== SKILL_MENTION_NAME) return true;
                    const hint = node.attrs.argumentHint;
                    if (typeof hint !== 'string' || hint.length === 0) {
                        return false;
                    }
                    const after = pos + node.nodeSize;
                    const rest = state.doc.textBetween(
                        after,
                        state.doc.resolve(after).end(),
                        ' ',
                    );
                    if (rest.trim().length === 0) {
                        decorations.push(
                            Decoration.widget(
                                after,
                                () => {
                                    const ghost =
                                        document.createElement('span');
                                    ghost.className =
                                        styles.contentMentionGhost;
                                    ghost.textContent = ` ${hint}`;
                                    return ghost;
                                },
                                { side: 1 },
                            ),
                        );
                    }
                    return false;
                });
                return DecorationSet.create(state.doc, decorations);
            },
        },
    });

export const createSkillMentionExtension = (
    options: SkillMentionExtensionOptions,
) =>
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
                    this.editor.commands.command(
                        deleteMentionBeforeCaret(this.name),
                    ),
            };
        },
        addProseMirrorPlugins() {
            return [...(this.parent?.() ?? []), argumentHintPlugin()];
        },
        addNodeView() {
            return ReactNodeViewRenderer(SkillMentionNodeView);
        },
    }).configure({
        suggestion: generateSkillMentionSuggestion(options),
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
    const mention = editor ? findSkillMention(editor) : null;
    if (mention === null) {
        return { context: undefined, optimisticContext: undefined };
    }
    const args = messageText.replace(`/${mention.name}`, '').trim();
    return {
        context: [{ type: 'skill', name: mention.name, arguments: args }],
        optimisticContext: [
            {
                type: 'skill',
                name: mention.name,
                arguments: args,
                skillUuid: null,
                pinnedVersionUuid: null,
                versionNumber: null,
                builtIn: mention.builtIn,
                displayName: null,
            },
        ],
    };
};
