import {
    ActionIcon,
    Box,
    Button,
    Group,
    Input,
    Menu,
    Radio,
    SimpleGrid,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconChartBar,
    IconCheck,
    IconLock,
    IconLockOpen,
    IconPencil,
    IconRefresh,
} from '@tabler/icons-react';
import clsx from 'clsx';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import MantineBaseProvider from '../providers/MantineBaseProvider';
import classes from './ChartMetadataRegenerate.module.css';

/**
 * Design exploration: where should the "regenerate with AI" button live in the
 * Save chart and Update chart modals?
 *
 * Each click regenerates the metadata in the next naming style, so repeated
 * clicks cycle Question → Compact → Descriptive → Short. Cancel discards
 * whatever was generated and restores the original values.
 */

type Placement =
    | 'inside'
    | 'label'
    | 'labelBordered'
    | 'hover'
    | 'besideLabel'
    | 'besideLabelHover'
    | 'above'
    | 'below'
    | 'styleMenu';
type ModalKind = 'save' | 'update';
type Target = 'name' | 'description' | 'both';

type Suggestion = { style: string; name: string; description: string };

const GENERATION_LATENCY_MS = 900;

// Generated titles must fit the name input without scrolling: about 42
// characters at 14px in the narrowest layout (option A, where the icon takes
// part of the field). Every mock title below is kept within that, except the
// deliberately long one option A uses (see LONG_GENERATED_TITLES).

// Save: the chart is new, the ambient AI prefill is the first suggestion.
const SAVE_SUGGESTIONS: Suggestion[] = [
    {
        style: 'Question',
        name: 'How many accounts are in each segment?',
        description:
            'Count of distinct accounts in each market segment, to compare segment reach.',
    },
    {
        style: 'Compact',
        name: 'Unique Accounts by Market Segment',
        description: 'Distinct accounts per market segment.',
    },
    {
        style: 'Descriptive',
        name: 'Account count across market segments',
        description:
            'Shows how the customer base is distributed across market segments, counting each account once.',
    },
    {
        style: 'Short',
        name: 'Accounts per Segment',
        description: 'Accounts in each segment.',
    },
];

// Update: the chart has since been split by region, so the saved name is stale.
// Longer than the name input is wide, and than the description's three rows
const LONG_VALUES = {
    name: 'How many unique accounts does each market segment have in each region over the last 12 months?',
    description:
        'Count of distinct accounts in each market segment, broken down by region and filtered to the last 12 months of activity. Use it to compare how widely each segment is represented across regions, and to spot regions where a segment is under-served compared with the others.',
};

const UPDATE_INITIAL = {
    name: 'Unique Accounts by Market Segment',
    description: 'Distinct accounts per market segment.',
};

const UPDATE_SUGGESTIONS: Suggestion[] = [
    {
        style: 'Question',
        name: 'How many accounts per segment and region?',
        description:
            'Count of distinct accounts per market segment, broken down by region.',
    },
    {
        style: 'Compact',
        name: 'Unique Accounts by Segment and Region',
        description: 'Distinct accounts per market segment and region.',
    },
    {
        style: 'Descriptive',
        name: 'Account count by segment, split by region',
        description:
            'Shows how accounts are distributed across market segments in each region, counting each account once.',
    },
    {
        style: 'Short',
        name: 'Accounts per Segment & Region',
        description: 'Accounts by segment and region.',
    },
];

const TOOLTIP_LABELS: Record<Target, string> = {
    name: 'Regenerate title',
    description: 'Regenerate description',
    both: 'Regenerate title and description',
};

/**
 * Element that portals (tooltips) should mount into, so they pick up the
 * frame's colour scheme instead of the page's.
 */
const PortalTargetContext = createContext<HTMLElement | undefined>(undefined);

/** Mock of the generate-metadata call: each call returns the next style. */
// Option A shows how a generated title longer than the input is cut off
const LONG_GENERATED_TITLES: Record<ModalKind, string> = {
    save: 'Unique account count across every market segment, compared side by side',
    update: 'Unique account count across market segments, split by region and filtered to the last 12 months',
};

const useMockRegenerate = (
    kind: ModalKind,
    onGenerated: (target: Target, suggestion: Suggestion) => void,
    withLongTitle = false,
) => {
    const suggestions = useMemo(() => {
        const base = kind === 'save' ? SAVE_SUGGESTIONS : UPDATE_SUGGESTIONS;
        if (!withLongTitle) return base;
        return base.map((suggestion) =>
            suggestion.style === 'Descriptive'
                ? { ...suggestion, name: LONG_GENERATED_TITLES[kind] }
                : suggestion,
        );
    }, [kind, withLongTitle]);
    // Save opens with the first suggestion already applied; update opens stale.
    const nextIndex = useRef<Record<'name' | 'description', number>>({
        name: kind === 'save' ? 1 : 0,
        description: kind === 'save' ? 1 : 0,
    });
    const [loadingTarget, setLoadingTarget] = useState<Target | null>(null);
    const [lastStyle, setLastStyle] = useState<string | null>(
        kind === 'save' ? suggestions[0].style : null,
    );
    const timeout = useRef<number>(undefined);

    useEffect(() => () => window.clearTimeout(timeout.current), []);

    const regenerate = useCallback(
        (target: Target) => {
            setLoadingTarget(target);
            timeout.current = window.setTimeout(() => {
                const key = target === 'description' ? 'description' : 'name';
                const index = nextIndex.current[key];
                const suggestion = suggestions[index];
                const advance = (field: 'name' | 'description') => {
                    nextIndex.current[field] =
                        (nextIndex.current[field] + 1) % suggestions.length;
                };
                if (target === 'both') {
                    nextIndex.current.description = index;
                    advance('name');
                    advance('description');
                } else {
                    advance(key);
                }
                setLoadingTarget(null);
                setLastStyle(suggestion.style);
                onGenerated(target, suggestion);
            }, GENERATION_LATENCY_MS);
        },
        [onGenerated, suggestions],
    );

    const reset = useCallback(() => {
        window.clearTimeout(timeout.current);
        setLoadingTarget(null);
        setLastStyle(kind === 'save' ? suggestions[0].style : null);
        nextIndex.current = {
            name: kind === 'save' ? 1 : 0,
            description: kind === 'save' ? 1 : 0,
        };
    }, [kind, suggestions]);

    return { regenerate, reset, loadingTarget, lastStyle };
};

const RegenerateActionIcon: FC<{
    target: Target;
    loading: boolean;
    disabled: boolean;
    onClick: () => void;
    /** Label-height, for sitting in a field's label row. */
    compact?: boolean;
    /** Bordered button, like the "Investigate" action in the AI launcher. */
    bordered?: boolean;
}> = ({
    target,
    loading,
    disabled,
    onClick,
    compact = false,
    bordered = false,
}) => {
    const portalTarget = useContext(PortalTargetContext);
    return (
        <Tooltip
            label={TOOLTIP_LABELS[target]}
            portalProps={{ target: portalTarget }}
        >
            <ActionIcon
                type="button"
                size={compact ? 'xs' : 'sm'}
                variant={bordered ? 'default' : 'subtle'}
                aria-label={TOOLTIP_LABELS[target]}
                loading={loading}
                disabled={disabled}
                onClick={onClick}
            >
                <MantineIcon
                    icon={IconRefresh}
                    size={compact ? 'sm' : undefined}
                />
            </ActionIcon>
        </Tooltip>
    );
};

const ChartMetadataModal: FC<{
    kind: ModalKind;
    placement: Placement;
    longText?: boolean;
}> = ({ kind, placement, longText = false }) => {
    const initialValues = longText
        ? LONG_VALUES
        : kind === 'save'
          ? {
                name: SAVE_SUGGESTIONS[0].name,
                description: SAVE_SUGGESTIONS[0].description,
            }
          : UPDATE_INITIAL;
    const [values, setValues] = useState(initialValues);

    const onGenerated = useCallback(
        (target: Target, suggestion: Suggestion) => {
            setValues((prev) => ({
                name: target === 'description' ? prev.name : suggestion.name,
                description:
                    target === 'name'
                        ? prev.description
                        : suggestion.description,
            }));
        },
        [],
    );
    const { regenerate, reset, loadingTarget, lastStyle } = useMockRegenerate(
        kind,
        onGenerated,
        placement === 'inside',
    );

    // The story keeps the modal open: Cancel discards the generated values.
    const handleCancel = () => {
        reset();
        setValues(initialValues);
    };

    const isGenerating = loadingTarget !== null;
    const isBordered = placement === 'labelBordered';
    const regenerateIcon = (target: Target, compact?: boolean) => (
        <RegenerateActionIcon
            target={target}
            loading={loadingTarget === target}
            disabled={isGenerating && loadingTarget !== target}
            onClick={() => regenerate(target)}
            compact={compact}
            bordered={compact && isBordered}
        />
    );

    // A single-line input keeps whatever scroll position it had. Whenever the
    // name is not being edited, pin a long title to one end: option A shows
    // its end (cut off on the left), the others show its start.
    const nameRef = useRef<HTMLInputElement>(null);
    const pinNameScroll = useCallback(
        (input: HTMLInputElement) => {
            input.scrollLeft = placement === 'inside' ? input.scrollWidth : 0;
        },
        [placement],
    );
    // Option A shows the full title in a tooltip when the input cuts it off
    const [isNameTruncated, setIsNameTruncated] = useState(false);
    const [isNameFocused, setIsNameFocused] = useState(false);
    const [isOverNameIcon, setIsOverNameIcon] = useState(false);
    const syncNameInput = useCallback(
        (input: HTMLInputElement) => {
            setIsNameTruncated(input.scrollWidth > input.clientWidth);
            if (document.activeElement !== input) pinNameScroll(input);
        },
        [pinNameScroll],
    );
    useEffect(() => {
        if (nameRef.current) syncNameInput(nameRef.current);
    }, [values.name, syncNameInput]);
    // A resize changes what fits, and keeps an offset that no longer lands
    // on the end
    useEffect(() => {
        const input = nameRef.current;
        if (!input) return;
        const observer = new ResizeObserver(() => syncNameInput(input));
        observer.observe(input);
        return () => observer.disconnect();
    }, [syncNameInput]);
    const portalTarget = useContext(PortalTargetContext);

    const styleHint = lastStyle
        ? `Suggested by AI · ${lastStyle} style`
        : 'Chart changed since this was named';

    const nameId = useId();
    const descriptionId = useId();
    const besideLabel =
        placement === 'besideLabel' || placement === 'besideLabelHover';
    const onHover = placement === 'hover' || placement === 'besideLabelHover';
    const labelRow = (
        id: string,
        label: string,
        target: Target,
        required?: boolean,
    ) => (
        <div
            className={clsx(
                classes.labelRow,
                besideLabel && classes.labelRowStart,
            )}
        >
            <Input.Label htmlFor={id} required={required}>
                {label}
            </Input.Label>
            {onHover ? (
                <span
                    className={classes.hoverAction}
                    // Stay visible while generating, even if the pointer leaves.
                    data-visible={loadingTarget === target || undefined}
                >
                    {regenerateIcon(target, true)}
                </span>
            ) : (
                regenerateIcon(target, true)
            )}
        </div>
    );
    const inLabel =
        placement === 'label' ||
        placement === 'labelBordered' ||
        placement === 'hover' ||
        placement === 'besideLabel' ||
        placement === 'besideLabelHover';

    const nameInput = (
        <TextInput
            ref={nameRef}
            id={nameId}
            classNames={{
                wrapper:
                    placement === 'inside' ? classes.revealOnHover : undefined,
            }}
            label={inLabel ? undefined : 'Chart name'}
            placeholder="eg. How many weekly active users do we have?"
            required
            withAsterisk={!inLabel}
            value={values.name}
            onChange={(e) => {
                const name = e.currentTarget.value;
                setValues((prev) => ({ ...prev, name }));
            }}
            onFocus={() => setIsNameFocused(true)}
            onBlur={(e) => {
                setIsNameFocused(false);
                pinNameScroll(e.currentTarget);
            }}
            rightSection={
                placement === 'inside' ? (
                    // Over the icon, its own tooltip shows instead: the app
                    // shows one tooltip at a time
                    <Box
                        component="span"
                        display="flex"
                        className={classes.revealAction}
                        data-visible={loadingTarget === 'name' || undefined}
                        onMouseEnter={() => setIsOverNameIcon(true)}
                        onMouseLeave={() => setIsOverNameIcon(false)}
                    >
                        {regenerateIcon('name')}
                    </Box>
                ) : undefined
            }
            inputContainer={
                placement === 'inside'
                    ? (input) => (
                          <Tooltip
                              label={values.name}
                              // Theme defaults (above, 200ms, 280px), like
                              // TruncatedText elsewhere in the app
                              disabled={
                                  !isNameTruncated ||
                                  isNameFocused ||
                                  isOverNameIcon
                              }
                              portalProps={{ target: portalTarget }}
                          >
                              <div>{input}</div>
                          </Tooltip>
                      )
                    : undefined
            }
            inputWrapperOrder={['label', 'input', 'description']}
            description={
                placement === 'below' && (
                    <Group gap="xs" mt={4} component="span">
                        <Button
                            type="button"
                            variant="subtle"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            loading={loadingTarget === 'both'}
                            onClick={() => regenerate('both')}
                        >
                            Regenerate
                        </Button>
                        <span>{styleHint}</span>
                    </Group>
                )
            }
        />
    );

    const descriptionInput = (
        <Textarea
            id={descriptionId}
            label={inLabel ? undefined : 'Chart description'}
            placeholder="A few words to give your team some context"
            autosize
            maxRows={3}
            value={values.description}
            onChange={(e) => {
                const description = e.currentTarget.value;
                setValues((prev) => ({ ...prev, description }));
            }}
            classNames={{
                wrapper:
                    placement === 'inside' ? classes.revealOnHover : undefined,
                section: classes.textareaSection,
                input: classes.hiddenScrollbar,
            }}
            rightSection={
                placement === 'inside' ? (
                    <Box
                        component="span"
                        display="flex"
                        className={classes.revealAction}
                        data-visible={
                            loadingTarget === 'description' || undefined
                        }
                    >
                        {regenerateIcon('description')}
                    </Box>
                ) : undefined
            }
        />
    );

    // The button sits between the fields, so a wider gap between fields than
    // between a label and its input keeps each button with its own field.
    const fields = inLabel ? (
        <Stack gap="md">
            <div className={classes.fieldGroup}>
                {labelRow(nameId, 'Chart name', 'name', true)}
                {nameInput}
            </div>
            <div className={classes.fieldGroup}>
                {labelRow(descriptionId, 'Chart description', 'description')}
                {descriptionInput}
            </div>
        </Stack>
    ) : (
        <>
            {nameInput}
            {descriptionInput}
        </>
    );

    const aboveRow = placement === 'above' && (
        <Group justify="space-between" wrap="nowrap">
            <Text fz="xs" c="dimmed">
                {styleHint}
            </Text>
            <Button
                type="button"
                variant="subtle"
                size="xs"
                leftSection={<MantineIcon icon={IconRefresh} />}
                loading={loadingTarget === 'both'}
                onClick={() => regenerate('both')}
            >
                Regenerate
            </Button>
        </Group>
    );

    return (
        <MantineModal
            opened
            onClose={handleCancel}
            title={kind === 'save' ? 'Save chart' : 'Update Chart'}
            icon={kind === 'save' ? IconChartBar : IconPencil}
            size="md"
            onCancel={handleCancel}
            actions={
                <Button type="button">
                    {kind === 'save' ? 'Next' : 'Save'}
                </Button>
            }
            // The modal sits in a fixed-height frame, not the viewport, so drop
            // the viewport-based height caps and always show it at full size.
            bodyScrollAreaMaxHeight="none"
            modalContentProps={{ mah: 'none' }}
            modalRootProps={{
                withinPortal: false,
                trapFocus: false,
                lockScroll: false,
                returnFocus: false,
                closeOnClickOutside: false,
                portalProps: { target: portalTarget },
            }}
        >
            <Stack gap="xs">
                {aboveRow}
                {fields}
                {kind === 'save' && (
                    <Stack gap="sm" mt="sm">
                        <Text fw={500}>Save to</Text>
                        <Radio.Group value="space">
                            <Stack gap="xs">
                                <Radio value="space" label="Space" />
                                <Radio value="dashboard" label="Dashboard" />
                            </Stack>
                        </Radio.Group>
                    </Stack>
                )}
            </Stack>
        </MantineModal>
    );
};

/*
 * Option H: hover the regenerate button to pick a style, and a lock per field.
 *
 * Title styles follow Andy Kirk's "Five ways to title your work"
 * (visualisingdata.com, 2019): the default descriptive title plus Statement,
 * Question, Artistic and Dynamic. His fifth, Visual (sparklines in the title),
 * cannot live in a text input, so it is left out. The article does not cover
 * descriptions, so their styles are our own.
 */
type TitleStyle =
    | 'descriptive'
    | 'question'
    | 'statement'
    | 'artistic'
    | 'dynamic';
type DescriptionStyle = 'descriptive' | 'takeaway' | 'context';

type StyleOption<T extends string> = {
    value: T;
    label: string;
    hint: string;
    /** Only makes sense while AI keeps the field up to date. */
    needsUnlock?: boolean;
};

const TITLE_STYLES: StyleOption<TitleStyle>[] = [
    {
        value: 'descriptive',
        label: 'Descriptive',
        hint: 'What it shows',
    },
    {
        value: 'question',
        label: 'Question',
        hint: 'What it answers',
    },
    {
        value: 'statement',
        label: 'Statement',
        hint: 'The key finding',
    },
    {
        value: 'artistic',
        label: 'Artistic',
        hint: 'Short and punchy',
    },
    {
        value: 'dynamic',
        label: 'Dynamic',
        hint: 'Changes with the data',
        needsUnlock: true,
    },
];

const DESCRIPTION_STYLES: StyleOption<DescriptionStyle>[] = [
    {
        value: 'descriptive',
        label: 'Descriptive',
        hint: "What's measured",
    },
    {
        value: 'takeaway',
        label: 'Takeaway',
        hint: 'What to notice',
    },
    {
        value: 'context',
        label: 'Context',
        hint: 'Why it matters',
    },
];

const MOCK_TITLES: Record<ModalKind, Record<TitleStyle, string>> = {
    save: {
        descriptive: 'Unique accounts by market segment',
        question: 'How many accounts are in each segment?',
        statement: 'Enterprise has twice as many accounts as SMB',
        artistic: 'Where our customers live',
        dynamic: 'Enterprise leads with 4,210 accounts',
    },
    update: {
        descriptive: 'Unique accounts by segment and region',
        question: 'How many accounts per segment and region?',
        statement: 'EMEA Enterprise is growing fastest',
        artistic: 'Four segments, five regions',
        dynamic: 'EMEA Enterprise up 18% this quarter',
    },
};

const MOCK_DESCRIPTIONS: Record<ModalKind, Record<DescriptionStyle, string>> = {
    save: {
        descriptive: 'Distinct accounts in each market segment, all time.',
        takeaway:
            'Enterprise has the most accounts, at roughly twice the size of SMB.',
        context:
            'Use this to size each segment before planning campaigns. Counts each account once.',
    },
    update: {
        descriptive: 'Distinct accounts per market segment, split by region.',
        takeaway:
            'Enterprise in EMEA is the largest and fastest-growing group.',
        context:
            'Compare segments across regions to spot where a segment is under-served.',
    },
};

type MetadataFieldState<T extends string> = {
    value: string;
    /** Style the value was generated in; null when written by hand. */
    style: T | null;
    /** Locked: AI never changes it. Unlocked: AI keeps it up to date. */
    locked: boolean;
};

const FieldControls = <T extends string>({
    fieldLabel,
    styles,
    state,
    loading,
    onGenerate,
    onToggleLock,
}: {
    fieldLabel: string;
    styles: StyleOption<T>[];
    state: MetadataFieldState<T>;
    loading: boolean;
    onGenerate: (style: T) => void;
    onToggleLock: () => void;
}) => {
    const portalTarget = useContext(PortalTargetContext);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const currentStyle = state.style ?? styles[0].value;

    return (
        <Group gap={2} wrap="nowrap">
            <Box
                component="span"
                display="flex"
                className={classes.revealAction}
                data-visible={loading || isMenuOpen || undefined}
            >
                <Menu
                    trigger="hover"
                    openDelay={100}
                    closeDelay={150}
                    position="bottom-end"
                    width={260}
                    onOpen={() => setIsMenuOpen(true)}
                    onClose={() => setIsMenuOpen(false)}
                    portalProps={{ target: portalTarget }}
                >
                    <Menu.Target>
                        <ActionIcon
                            type="button"
                            size="sm"
                            aria-label={`Regenerate ${fieldLabel}`}
                            loading={loading}
                            onClick={() => onGenerate(currentStyle)}
                        >
                            <MantineIcon icon={IconRefresh} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Regenerate {fieldLabel} as</Menu.Label>
                        {styles.map((option) => (
                            <Menu.Item
                                key={option.value}
                                disabled={option.needsUnlock && state.locked}
                                onClick={() => onGenerate(option.value)}
                                rightSection={
                                    option.value === state.style ? (
                                        <MantineIcon icon={IconCheck} />
                                    ) : null
                                }
                            >
                                <Text fz="sm">{option.label}</Text>
                                <Text fz="xs" c="dimmed">
                                    {option.hint}
                                </Text>
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </Box>
            {/* The lock is a standing state, so it always shows */}
            <Box component="span" display="flex">
                <Tooltip
                    label={
                        state.locked
                            ? 'Unlock to let AI update'
                            : 'Lock to stop AI updates'
                    }
                    portalProps={{ target: portalTarget }}
                >
                    <ActionIcon
                        type="button"
                        size="sm"
                        color={state.locked ? undefined : 'indigo'}
                        aria-label={
                            state.locked
                                ? `Unlock ${fieldLabel}`
                                : `Lock ${fieldLabel}`
                        }
                        aria-pressed={state.locked}
                        onClick={onToggleLock}
                    >
                        <MantineIcon
                            icon={state.locked ? IconLock : IconLockOpen}
                        />
                    </ActionIcon>
                </Tooltip>
            </Box>
        </Group>
    );
};

const useMockField = <T extends string>(
    initial: MetadataFieldState<T>,
    generateValue: (style: T) => string,
) => {
    const [state, setState] = useState(initial);
    const [loading, setLoading] = useState(false);
    const timeout = useRef<number>(undefined);
    useEffect(() => () => window.clearTimeout(timeout.current), []);

    const generate = (style: T) => {
        setLoading(true);
        timeout.current = window.setTimeout(() => {
            setLoading(false);
            setState((prev) => ({
                ...prev,
                value: generateValue(style),
                style,
            }));
        }, GENERATION_LATENCY_MS);
    };
    const reset = () => {
        window.clearTimeout(timeout.current);
        setLoading(false);
        setState(initial);
    };
    return {
        state,
        loading,
        generate,
        reset,
        setValue: (value: string) =>
            // Editing by hand makes it the user's, so it no longer has a style
            setState((prev) => ({ ...prev, value, style: null })),
        // Locking a dynamic title freezes it at its current value
        toggleLock: () =>
            setState((prev) => ({ ...prev, locked: !prev.locked })),
    };
};

const StyleMenuModal: FC<{ kind: ModalKind }> = ({ kind }) => {
    const portalTarget = useContext(PortalTargetContext);
    const name = useMockField<TitleStyle>(
        kind === 'save'
            ? {
                  value: MOCK_TITLES.save.question,
                  style: 'question',
                  locked: true,
              }
            : { value: UPDATE_INITIAL.name, style: null, locked: true },
        (style) => MOCK_TITLES[kind][style],
    );
    const description = useMockField<DescriptionStyle>(
        kind === 'save'
            ? {
                  value: MOCK_DESCRIPTIONS.save.descriptive,
                  style: 'descriptive',
                  locked: true,
              }
            : {
                  value: UPDATE_INITIAL.description,
                  style: null,
                  locked: true,
              },
        (style) => MOCK_DESCRIPTIONS[kind][style],
    );
    const handleCancel = () => {
        name.reset();
        description.reset();
    };

    const unlockedHint = (locked: boolean) =>
        locked ? undefined : 'AI keeps this up to date.';

    return (
        <MantineModal
            opened
            onClose={handleCancel}
            title={kind === 'save' ? 'Save chart' : 'Update Chart'}
            icon={kind === 'save' ? IconChartBar : IconPencil}
            size="md"
            onCancel={handleCancel}
            actions={
                <Button type="button">
                    {kind === 'save' ? 'Next' : 'Save'}
                </Button>
            }
            bodyScrollAreaMaxHeight="none"
            modalContentProps={{ mah: 'none' }}
            modalRootProps={{
                withinPortal: false,
                trapFocus: false,
                lockScroll: false,
                returnFocus: false,
                closeOnClickOutside: false,
                portalProps: { target: portalTarget },
            }}
        >
            <Stack gap="xs">
                <TextInput
                    label="Chart name"
                    required
                    placeholder="eg. How many weekly active users do we have?"
                    value={name.state.value}
                    onChange={(e) => name.setValue(e.currentTarget.value)}
                    classNames={{ wrapper: classes.revealOnHover }}
                    rightSectionWidth={56}
                    rightSection={
                        <FieldControls
                            fieldLabel="title"
                            styles={TITLE_STYLES}
                            state={name.state}
                            loading={name.loading}
                            onGenerate={name.generate}
                            onToggleLock={name.toggleLock}
                        />
                    }
                    inputWrapperOrder={['label', 'input', 'description']}
                    description={unlockedHint(name.state.locked)}
                />
                <Textarea
                    label="Chart description"
                    placeholder="A few words to give your team some context"
                    autosize
                    maxRows={3}
                    value={description.state.value}
                    onChange={(e) =>
                        description.setValue(e.currentTarget.value)
                    }
                    classNames={{
                        wrapper: classes.revealOnHover,
                        section: classes.textareaSection,
                        input: classes.hiddenScrollbar,
                    }}
                    rightSectionWidth={56}
                    rightSection={
                        <FieldControls
                            fieldLabel="description"
                            styles={DESCRIPTION_STYLES}
                            state={description.state}
                            loading={description.loading}
                            onGenerate={description.generate}
                            onToggleLock={description.toggleLock}
                        />
                    }
                    inputWrapperOrder={['label', 'input', 'description']}
                    description={unlockedHint(description.state.locked)}
                />
                {kind === 'save' && (
                    <Stack gap="sm" mt="sm">
                        <Text fw={500}>Save to</Text>
                        <Radio.Group value="space">
                            <Stack gap="xs">
                                <Radio value="space" label="Space" />
                                <Radio value="dashboard" label="Dashboard" />
                            </Stack>
                        </Radio.Group>
                    </Stack>
                )}
            </Stack>
        </MantineModal>
    );
};

/**
 * Renders its children under a scoped, forced colour scheme, the same way the
 * navbar forces dark, so light and dark can sit side by side.
 */
const SchemeFrame: FC<
    PropsWithChildren<{ scheme: 'light' | 'dark'; tall?: boolean }>
> = ({ scheme, tall = false, children }) => {
    const id = `scheme-frame-${useId().replace(/:/g, '')}`;
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const getRootElement = useCallback(() => element ?? undefined, [element]);

    return (
        <Box
            id={id}
            ref={setElement}
            data-mantine-color-scheme={scheme}
            className={clsx(classes.frame, tall && classes.frameTall)}
        >
            {element && (
                <MantineBaseProvider
                    forceColorScheme={scheme}
                    cssVariablesSelector={`#${id}`}
                    getRootElement={getRootElement}
                    withGlobalClasses={false}
                >
                    <PortalTargetContext.Provider value={element}>
                        {children}
                    </PortalTargetContext.Provider>
                </MantineBaseProvider>
            )}
        </Box>
    );
};

const PLACEMENT_COPY: Record<Placement, { title: string; detail: string }> = {
    styleMenu: {
        title: 'H · Pick a style, and lock or unlock AI updates',
        detail: 'Hover the refresh icon to choose a style for the title (Descriptive, Question, Statement, Artistic, Dynamic) or the description (Descriptive, Takeaway, Context). The lock next to it is always shown and starts locked: locked fields stay static, unlocked ones are kept up to date by AI as the chart changes. Dynamic titles need the lock off.',
    },
    inside: {
        title: 'A · Inside each input',
        detail: 'A refresh icon inside the right end of both the name and the description box, each regenerating its own field. Each icon only shows while its own box is hovered or focused. The icon reserves its own space so it never sits on top of text, and a long name shows its end (cut off on the left) whenever it is not being edited. Hovering a cut-off name shows it in full.',
    },
    label: {
        title: 'B · In each label row',
        detail: 'A small refresh icon at the right of the "Chart name" and "Chart description" labels. The inputs keep their full width and normal spacing, and each field can be regenerated on its own.',
    },
    labelBordered: {
        title: 'B2 · In each label row, bordered',
        detail: 'As B, but the icon is a bordered button (the style of the "Investigate" action in the AI launcher), so it reads as a button before you hover it.',
    },
    hover: {
        title: 'E · In each label row, on hover',
        detail: 'As B, but the icon only appears while the pointer is over the field (its label or input) or the field has keyboard focus. It stays shown while generating, and always shows on touch screens.',
    },
    besideLabel: {
        title: 'F · Next to each label',
        detail: 'As B, but the icon sits straight after the "Chart name" and "Chart description" labels instead of at the far right, so it reads as part of the label.',
    },
    besideLabelHover: {
        title: 'G · Next to each label, on hover',
        detail: 'F and E combined: the icon sits straight after the label and only appears while the field is hovered or has keyboard focus. It stays shown while generating, and always shows on touch screens.',
    },
    above: {
        title: 'C · Above the inputs',
        detail: 'A labelled "Regenerate" button above the fields regenerates both, with the current style shown alongside.',
    },
    below: {
        title: 'D · Below the name input',
        detail: 'A compact "Regenerate" action in the name field\'s helper line, next to the current style. Nothing touches the input itself.',
    },
};

const PlacementGrid: FC<{ placement: Placement; longText?: boolean }> = ({
    placement,
    longText,
}) => (
    <Stack gap="md" p="xl">
        <Stack gap={4}>
            <Title order={4}>{PLACEMENT_COPY[placement].title}</Title>
            <Text c="dimmed">{PLACEMENT_COPY[placement].detail}</Text>
            <Text c="dimmed" fz="sm">
                {placement === 'styleMenu'
                    ? 'Click refresh to regenerate in the current style, or hover it to pick another. Cancel restores the original values.'
                    : 'Click refresh to cycle naming styles (Question → Compact → Descriptive → Short). Cancel restores the original values.'}
            </Text>
        </Stack>
        <SimpleGrid cols={2} spacing="lg">
            {(['save', 'update'] as const).map((kind) =>
                (['light', 'dark'] as const).map((scheme) => (
                    <Stack key={`${kind}-${scheme}`} gap="xs">
                        <Text fw={500} fz="sm">
                            {kind === 'save' ? 'Save chart' : 'Update chart'} ·{' '}
                            {scheme === 'light' ? 'Light' : 'Dark'}
                        </Text>
                        <SchemeFrame
                            scheme={scheme}
                            // Room below the fields for the style menu
                            tall={placement === 'styleMenu'}
                        >
                            {placement === 'styleMenu' ? (
                                <StyleMenuModal kind={kind} />
                            ) : (
                                <ChartMetadataModal
                                    kind={kind}
                                    placement={placement}
                                    longText={longText}
                                />
                            )}
                        </SchemeFrame>
                    </Stack>
                )),
            )}
        </SimpleGrid>
    </Stack>
);

const meta = {
    title: 'Explorations/Chart metadata regenerate',
    component: PlacementGrid,
    parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PlacementGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A · a refresh icon inside both the name and description inputs. */
export const InsideInput: Story = { args: { placement: 'inside' } };

/** A with a title wider than the input and a description over three rows. */
export const InsideInputLongText: Story = {
    args: { placement: 'inside', longText: true },
};

/** B · a refresh icon in each field's label row. */
export const InLabelRow: Story = { args: { placement: 'label' } };

/** B2 · a bordered refresh button in each field's label row. */
export const InLabelRowBordered: Story = {
    args: { placement: 'labelBordered' },
};

/** E · the label-row icon appears on hover or focus of its field. */
export const OnHover: Story = { args: { placement: 'hover' } };

/** F · the icon sits straight after each label. */
export const NextToLabel: Story = { args: { placement: 'besideLabel' } };

/** G · next to each label, shown on hover or focus of its field. */
export const NextToLabelOnHover: Story = {
    args: { placement: 'besideLabelHover' },
};

/** H · a style menu on the refresh button, and a lock per field. */
export const StyleMenuAndLock: Story = { args: { placement: 'styleMenu' } };

/** C · one labelled Regenerate button above the inputs. */
export const AboveInputs: Story = { args: { placement: 'above' } };

/** D · a compact Regenerate action under the name input. */
export const BelowNameInput: Story = { args: { placement: 'below' } };
