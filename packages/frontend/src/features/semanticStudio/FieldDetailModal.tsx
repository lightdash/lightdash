import {
    Autocomplete,
    Box,
    Button,
    Group,
    Modal,
    Switch,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { getHotkeyHandler } from '@mantine/hooks';
import { IconLock } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    Fragment,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { ItemDetailMarkdown } from '../../components/Explorer/ExploreTree/TableTree/ItemDetailPreview';
import { useUpdateLiveSourceFields } from '../externalConnections/hooks/useLiveSourceFields';
import classes from './FieldDetailModal.module.css';
import {
    isSameDraft,
    toFieldChange,
    toFieldDraft,
    type FieldDraft,
} from './fieldDraft';
import { getSource, type Explore, type Field } from './model';
import { FieldTypeIcon } from './shared';
import sharedClasses from './shared.module.css';
import { useAddToStudioChat } from './studioChatRefs';
import { type ViewModel } from './useSemanticStudio';

dayjs.extend(relativeTime);

// ---------------------------------------------------------------------------
// Details: one modal for fields, explores and sources. What you can edit
// comes first, then a hairline, then everything else about it.

const PropertyRow: FC<{ term: string; children: ReactNode }> = ({
    term,
    children,
}) => (
    <>
        <Text className={classes.propertyTerm}>{term}</Text>
        <Box miw={0} className={classes.propertyValue}>
            {children}
        </Box>
    </>
);

/** A read-only value, on the same line as an editable one would be. */
const Value: FC<{ children: ReactNode; code?: boolean }> = ({
    children,
    code,
}) => (
    <Text className={classes.inlineStatic} data-code={code}>
        {children}
    </Text>
);

/** An editable value: a plain input, so it reads as editable at a glance. */
const EditableText: FC<{
    value: string;
    placeholder: string;
    readOnly: boolean;
    multiline?: boolean;
    autoFocus?: boolean;
    onChange: (value: string) => void;
}> = ({ value, placeholder, readOnly, multiline, autoFocus, onChange }) =>
    readOnly && multiline && value ? (
        <Box className={classes.inlineMarkdown}>
            <ItemDetailMarkdown source={value} />
        </Box>
    ) : readOnly ? (
        <Text className={classes.inlineStatic} data-empty={!value}>
            {value || placeholder}
        </Text>
    ) : multiline ? (
        <Textarea
            size="xs"
            autosize
            minRows={2}
            maxRows={8}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
        />
    ) : (
        <TextInput
            size="xs"
            placeholder={placeholder}
            value={value}
            data-autofocus={autoFocus ? true : undefined}
            onChange={(event) => onChange(event.currentTarget.value)}
        />
    );

const DetailModal: FC<{
    icon: ReactNode;
    title: string;
    subtitle: string;
    onClose: () => void;
    /** Editable properties; left out when nothing here can be edited. */
    editable?: ReactNode;
    /** Everything else about it, read only; left out when there's nothing. */
    facts?: ReactNode;
    /** One quiet line under the properties: where it comes from and so on. */
    summary?: ReactNode;
    /** Left: what saving does or why you can't. Right: the actions. */
    note?: ReactNode;
    actions: ReactNode;
    onSaveHotkey?: () => void;
    /** Nothing to type into: focus lands on the body, not the close button. */
    focusBody?: boolean;
}> = ({
    icon,
    title,
    subtitle,
    onClose,
    editable,
    facts,
    summary,
    note,
    actions,
    onSaveHotkey,
    focusBody,
}) => (
    <Modal
        opened
        onClose={onClose}
        size={600}
        title={
            <Group gap={10} wrap="nowrap" miw={0}>
                <Box flex="none" display="flex">
                    {icon}
                </Box>
                <Box miw={0}>
                    <Text className={classes.modalTitle} truncate>
                        {title}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate>
                        {subtitle}
                    </Text>
                </Box>
            </Group>
        }
        classNames={{ title: classes.modalTitleSlot }}
    >
        <Box
            className={classes.modalContent}
            tabIndex={focusBody ? -1 : undefined}
            data-autofocus={focusBody ? true : undefined}
            onKeyDown={
                onSaveHotkey
                    ? getHotkeyHandler([['mod+Enter', onSaveHotkey]])
                    : undefined
            }
        >
            <Box className={classes.detailList}>
                {editable}
                {editable && facts ? (
                    <Box className={classes.detailDivider} />
                ) : null}
                {facts}
            </Box>
            {summary ? (
                <Text className={classes.detailSummary}>{summary}</Text>
            ) : null}
            <Group
                className={classes.modalFooter}
                justify="space-between"
                gap="sm"
                wrap="nowrap"
            >
                <Box miw={0}>{note}</Box>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {actions}
                </Group>
            </Group>
        </Box>
    </Modal>
);

const CloseButton: FC<{ onClose: () => void }> = ({ onClose }) => (
    <Button
        size="xs"
        variant="default"
        className={sharedClasses.pressable}
        onClick={onClose}
    >
        Close
    </Button>
);

/** "count_distinct" reads "Count distinct". */
const typeLabel = (type: string): string => {
    const words = type.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Where the field comes from, its charts and its last change, in a line. */
const FieldSummary: FC<{ field: Field }> = ({ field }) => {
    const parts: ReactNode[] = [
        <span key="definition">
            {field.definition.label}{' '}
            <code className={classes.detailSummaryCode}>
                {field.definition.value}
            </code>
        </span>,
    ];
    if (field.chartUsage !== null) {
        parts.push(
            field.chartUsage
                ? `Used in ${field.chartUsage.toLocaleString()} chart${field.chartUsage === 1 ? '' : 's'}`
                : 'Not used in any chart',
        );
    }
    if (field.lastEdit) {
        parts.push(
            `Changed by ${field.lastEdit.by} ${dayjs(field.lastEdit.at).fromNow()}`,
        );
    }
    return (
        <>
            {parts.map((part, index) => (
                <Fragment key={index}>
                    {index > 0 ? ' · ' : null}
                    {part}
                </Fragment>
            ))}
        </>
    );
};

export const FieldDetailModal: FC<{
    view: ViewModel;
    explore: Explore;
    field: Field;
    /** The explore's groups, offered when moving the field to another. */
    groups: string[];
    onClose: () => void;
    /** Opens the YAML that defines it; null when there is none to show. */
    onViewCode: (() => void) | null;
}> = ({ view, explore, field, groups, onClose, onViewCode }) => {
    const addToChat = useAddToStudioChat();
    const source = getSource(view.project, explore.sourceId);
    const saved = toFieldDraft(field);
    // Typed here and handed to the view on close: the view keeps it, and typing does not render the whole page.
    const [draft, setDraft] = useState(
        () => view.getDraft(explore, field) ?? saved,
    );
    // What was just saved counts as saved before the field is read again.
    const [committed, setCommitted] = useState<FieldDraft | null>(null);
    const isSaved = (next: FieldDraft) =>
        isSameDraft(next, saved) ||
        (committed !== null && isSameDraft(next, committed));
    const keep = useRef(() => {});
    keep.current = () =>
        view.setDraft(explore, field, isSaved(draft) ? null : draft);
    useEffect(() => () => keep.current(), []);
    const canEdit = view.canEditFields(explore);
    const isLive = source.kind === 'live';
    const dirty = !isSaved(draft);
    const discard = () => setDraft(committed ?? saved);
    const update = useUpdateLiveSourceFields({
        projectUuid: view.project.id,
        connectionUuid: source.connectionUuid ?? '',
    });
    const save = () => {
        update.mutate(
            [
                {
                    ...toFieldChange(field.name, draft, saved),
                    exploreName: explore.name,
                },
            ],
            {
                onSuccess: () => setCommitted(draft),
            },
        );
    };
    const facts = [
        field.table !== explore.name
            ? { term: 'Table', value: field.tableLabel }
            : null,
        isLive ? { term: 'Field ID', value: field.id } : null,
        field.group && !(isLive && canEdit)
            ? { term: 'Group', value: field.group }
            : null,
        field.visibleTo
            ? { term: 'Visible to', value: `People with ${field.visibleTo}` }
            : null,
        field.hiddenFromAi
            ? {
                  term: 'AI access',
                  value: 'Never sent to AI. People can still use it.',
              }
            : null,
    ].filter((fact) => fact !== null);
    const note =
        !canEdit && isLive ? (
            <Group gap={6} wrap="nowrap" miw={0}>
                <MantineIcon icon={IconLock} size={12} color="dimmed" />
                <Text fz="xs" c="dimmed" truncate>
                    Only project admins can edit live data source fields
                </Text>
            </Group>
        ) : onViewCode || addToChat ? (
            <Group gap={4} wrap="nowrap" miw={0}>
                {isLive ? null : (
                    <Text fz="xs" c="dimmed" truncate mr="xs">
                        A model's fields are edited in its code.
                    </Text>
                )}
                {onViewCode ? (
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        className={sharedClasses.pressable}
                        onClick={onViewCode}
                    >
                        View code
                    </Button>
                ) : null}
                {addToChat ? (
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        className={sharedClasses.pressable}
                        onClick={() => {
                            addToChat({
                                modelName: explore.id,
                                fieldName: field.id,
                                modelLabel: explore.label,
                                fieldLabel: field.label,
                                fieldKind: field.fieldKind,
                                fieldType: field.type,
                                code: null,
                            });
                            onClose();
                        }}
                    >
                        Ask in chat
                    </Button>
                ) : null}
            </Group>
        ) : null;

    return (
        <DetailModal
            icon={<FieldTypeIcon field={field} size="lg" />}
            title={field.label}
            subtitle={`${typeLabel(field.type)} ${field.fieldKind === 'metric' ? 'metric' : 'dimension'} in ${explore.label}`}
            onClose={onClose}
            onSaveHotkey={canEdit && dirty ? save : undefined}
            focusBody={!canEdit}
            editable={
                <>
                    <PropertyRow term="Label">
                        <EditableText
                            autoFocus
                            value={draft.label}
                            placeholder="Label"
                            readOnly={!canEdit}
                            onChange={(label) => setDraft({ ...draft, label })}
                        />
                    </PropertyRow>
                    <PropertyRow term="Description">
                        <EditableText
                            multiline
                            value={draft.description}
                            placeholder={
                                canEdit ? 'Add a description' : 'No description'
                            }
                            readOnly={!canEdit}
                            onChange={(description) =>
                                setDraft({ ...draft, description })
                            }
                        />
                    </PropertyRow>
                    <PropertyRow term="AI hint">
                        <EditableText
                            multiline
                            value={draft.aiHint}
                            placeholder={
                                canEdit
                                    ? 'Tell AI agents when to use this field'
                                    : 'No AI hint'
                            }
                            readOnly={!canEdit}
                            onChange={(aiHint) =>
                                setDraft({ ...draft, aiHint })
                            }
                        />
                    </PropertyRow>
                    {isLive && canEdit ? (
                        <PropertyRow term="Group">
                            <Autocomplete
                                size="xs"
                                aria-label="Group"
                                placeholder="No group"
                                data={groups}
                                value={draft.group}
                                limit={50}
                                comboboxProps={{ withinPortal: true }}
                                onChange={(group) =>
                                    setDraft({ ...draft, group })
                                }
                            />
                        </PropertyRow>
                    ) : null}
                    {isLive ? (
                        <PropertyRow term="In use">
                            <Group className={classes.detailControl} gap={8}>
                                <Switch
                                    size="sm"
                                    aria-label={`${field.label} in use`}
                                    checked={draft.inUse}
                                    disabled={!canEdit || field.isRequired}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            inUse: event.currentTarget.checked,
                                        })
                                    }
                                />
                                {field.isRequired ? (
                                    <Text fz="xs" c="dimmed">
                                        Every query needs it
                                    </Text>
                                ) : null}
                            </Group>
                        </PropertyRow>
                    ) : null}
                </>
            }
            facts={
                facts.length > 0 ? (
                    <>
                        {facts.map(({ term, value }) => (
                            <PropertyRow key={term} term={term}>
                                <Value>{value}</Value>
                            </PropertyRow>
                        ))}
                    </>
                ) : undefined
            }
            summary={<FieldSummary field={field} />}
            note={note}
            actions={
                canEdit ? (
                    <>
                        {dirty ? (
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                className={sharedClasses.pressable}
                                disabled={update.isLoading}
                                onClick={discard}
                            >
                                Discard
                            </Button>
                        ) : null}
                        <Button
                            size="xs"
                            className={sharedClasses.pressable}
                            disabled={!dirty}
                            loading={update.isLoading}
                            onClick={save}
                        >
                            Save
                        </Button>
                    </>
                ) : (
                    <CloseButton onClose={onClose} />
                )
            }
        />
    );
};
