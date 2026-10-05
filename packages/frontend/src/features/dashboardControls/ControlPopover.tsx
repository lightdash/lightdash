import {
    Box,
    Button,
    Group,
    Loader,
    Popover,
    Stack,
    Tabs,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { isFilterEnabled } from '../dashboardFilters/FilterConfiguration/utils';
import {
    useDashboardControls,
    useMappableSummary,
    type ControlModel,
    type ControlPopoverTab,
} from './context';
import ControlChoiceStep from './ControlChoiceStep';
import { isControlMapped, type ControlDraft } from './controlDraft';
import ControlMappings from './ControlMappings';
import { FilterControlValue, ParameterControlValue } from './ControlValue';
import classes from './dashboardControls.module.css';
import { getApplyBlock } from './guard';
import { useControlLabel } from './useControlLabel';

const isControlTab = (value: string | null): value is ControlPopoverTab =>
    value === 'settings' || value === 'mapsTo';

type ContentProps = { draft: ControlDraft; model: ControlModel };

// One width for the first step and both tabs: the footer never moves sideways
const CONTROL_POPOVER_WIDTH = 'min(500px, calc(100vw - 56px))';

// The one way out of an open control: "Cancel" drops its draft, "Apply"
// writes all of it to the dashboard. Shared by both tabs and the shrunk line.
const Footer: FC<ContentProps & { showsReason: boolean }> = ({
    draft,
    model,
    showsReason,
}) => {
    const getUiString = useUiStrings();
    const { apply, cancel, draftsTemporaryFilters, isGuardNoticeShown } =
        useDashboardControls();
    // A new temporary filter needs a value, as in today's view-mode popover
    const hasValue =
        draft.kind === 'parameter' ||
        (draftsTemporaryFilters
            ? isFilterEnabled(draft.rule, false, draft.isNew)
            : isFilterEnabled(draft.rule, true, false));
    const block = getApplyBlock({
        isLoading: model.isLoading,
        isMapped: isControlMapped(draft),
        mappedCount: model.overview.mappedCount,
        hasValue,
    });
    // Why another pill did not open, else why "Apply" is off
    const getReason = (): string | null => {
        if (isGuardNoticeShown) return 'Apply or cancel first';
        if (block === 'noTiles') return `Add a ${model.noun} to apply`;
        if (block === 'noValue' && draftsTemporaryFilters) {
            return 'Choose a value to apply';
        }
        return null;
    };
    const reason = showsReason ? getReason() : null;

    return (
        <Group gap="xs" wrap="nowrap" justify="flex-end" flex="0 0 auto">
            {reason !== null && (
                <Text fz="xs" c="dimmed" mr="auto" aria-live="polite">
                    {reason}
                </Text>
            )}
            <Button size="xs" variant="default" onClick={cancel}>
                Cancel
            </Button>
            <Tooltip
                label={getUiString('filters.config.applyRequiredTooltip')}
                disabled={block !== 'noValue'}
            >
                <Box>
                    <Button
                        size="xs"
                        disabled={block !== null}
                        // Mouse applies on mousedown: with an inline dropdown
                        // open, click-outside handling runs on mousedown and
                        // the click never arrives
                        onMouseDown={(event) => {
                            if (event.button === 0) apply();
                        }}
                        onClick={(event) => {
                            if (event.detail === 0) apply();
                        }}
                    >
                        {getUiString('filters.apply')}
                    </Button>
                </Box>
            </Tooltip>
        </Group>
    );
};

// The popover shrunk to one line: what the draft applies to, and the footer
const Shrunk: FC<ContentProps> = ({ draft, model }) => {
    const { showPopover } = useDashboardControls();
    const label = useControlLabel({ draft, model });
    const summary = useMappableSummary(null);
    const { mappedCount, mappableCount } = model.overview;

    return (
        <Group gap="sm" wrap="nowrap">
            <Tooltip label={summary} disabled={model.isLoading}>
                <UnstyledButton
                    className={classes.shrunkLabel}
                    aria-label={`Open ${label}`}
                    onClick={showPopover}
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconChevronDown} color="dimmed" />
                        <Text fz="xs" truncate>
                            <Text span inherit fw={600}>
                                {label}
                            </Text>
                            {model.isLoading
                                ? ' applies to'
                                : ` applies to ${mappedCount} of ${mappableCount} tiles`}
                        </Text>
                        {model.isLoading && <Loader size="xs" />}
                    </Group>
                </UnstyledButton>
            </Tooltip>
            <Footer draft={draft} model={model} showsReason={false} />
        </Group>
    );
};

// The same tabs shell as today's filter popover. Both tabs edit the one
// draft; the footer under them applies or drops all of it.
const Content: FC<ContentProps> = ({ draft, model }) => {
    const getUiString = useUiStrings();
    const {
        subPopoverProps,
        tabs,
        popoverTab,
        setPopoverTab,
        setLabel,
        setFilterSettings,
        setParameterValue,
        draftsTemporaryFilters,
        takeChoiceFocus,
    } = useDashboardControls();

    // After the first step the focus comes into the popover, so Escape
    // reaches it: a temporary filter's value (the input after the
    // operator's), else the active tab
    const rootRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const pending = takeChoiceFocus();
        if (pending === null) return;
        const valueInput =
            pending === 'value'
                ? settingsRef.current?.querySelectorAll<HTMLElement>(
                      'input:not([type="hidden"]):not(:disabled)',
                  )[1]
                : undefined;
        const tab = rootRef.current?.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
        );
        (valueInput ?? tab)?.focus();
    }, [takeChoiceFocus]);

    const label =
        draft.kind === 'filter'
            ? (draft.rule.label ?? '')
            : draft.control.label;
    const tilesTab = (
        <Tabs.Tab value="mapsTo">
            {getUiString(
                tabs.length > 1
                    ? 'filters.config.tabsAndTilesTab'
                    : 'filters.config.tilesTab',
            )}
        </Tabs.Tab>
    );

    return (
        // Dropdowns render inside the popover, so choosing an option is never
        // a click outside it, and float over it, so the footer stays put
        <Stack ref={rootRef} w={CONTROL_POPOVER_WIDTH}>
            <Tabs
                value={popoverTab}
                onChange={(value) => {
                    if (isControlTab(value)) setPopoverTab(value);
                }}
            >
                <Tabs.List mb="md">
                    {/* No tooltip here: it would open over the pill when the
                        popover opens with this tab focused */}
                    <Tabs.Tab value="settings">Settings</Tabs.Tab>
                    {/* The tooltip speaks of "this filter" */}
                    {draft.kind === 'filter' ? (
                        <Tooltip
                            label={getUiString(
                                tabs.length > 1
                                    ? 'filters.config.tabsAndTilesTabTooltip'
                                    : 'filters.config.tilesTabTooltip',
                            )}
                            position="top-start"
                        >
                            {tilesTab}
                        </Tooltip>
                    ) : (
                        tilesTab
                    )}
                </Tabs.List>

                <Tabs.Panel value="settings">
                    <Stack gap="sm" ref={settingsRef}>
                        {!draftsTemporaryFilters && (
                            <TextInput
                                size="xs"
                                label="Label"
                                placeholder={model.field?.label || 'Label'}
                                value={label}
                                onChange={(event) =>
                                    setLabel(event.currentTarget.value)
                                }
                            />
                        )}
                        {draft.kind === 'filter' ? (
                            <FilterControlValue
                                rule={draft.rule}
                                controlType={draft.controlType}
                                isNew={draft.isNew}
                                isTemporary={draftsTemporaryFilters}
                                model={model}
                                onChange={setFilterSettings}
                                popoverProps={{
                                    ...subPopoverProps,
                                    withinPortal: false,
                                }}
                            />
                        ) : (
                            <ParameterControlValue
                                keys={draft.control.parameterKeys}
                                value={draft.value}
                                model={model}
                                onChange={setParameterValue}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="mapsTo">
                    <ControlMappings model={model} />
                </Tabs.Panel>
            </Tabs>
            <Footer draft={draft} model={model} showsReason />
        </Stack>
    );
};

// What the open control shows under its pill: the popover, or the one line
// it shrinks to
export const ControlPopoverContent: FC = () => {
    const {
        draft,
        model,
        isPopoverOpen,
        isChoosing,
        isGuardNoticeShown,
        clearGuardNotice,
    } = useDashboardControls();
    if (!draft || !model) return null;
    if (!isPopoverOpen) return <Shrunk draft={draft} model={model} />;
    return (
        // A press inside ends "Apply or cancel first"
        <Box
            onPointerDownCapture={
                isGuardNoticeShown ? clearGuardNotice : undefined
            }
        >
            {isChoosing ? (
                <ControlChoiceStep draft={draft} model={model} />
            ) : (
                <Content draft={draft} model={model} />
            )}
        </Box>
    );
};

// Anchors the open control's popover to its pill, with the filter popover's
// own placement. It stays under the pill for as long as the control is open:
// a press outside or Escape shrinks it and nothing is dropped.
export const ControlPillPopover: FC<{
    isSelected: boolean;
    children: ReactNode;
}> = ({ isSelected, children }) => {
    const { isPopoverOpen, isSubPopoverOpen, dismissPopover } =
        useDashboardControls();
    const canDismiss = isPopoverOpen && !isSubPopoverOpen;
    return (
        <Popover
            position="bottom-start"
            // The pill is in a sticky bar: fixed keeps the popover still on scroll
            floatingStrategy="fixed"
            trapFocus={isPopoverOpen}
            opened={isSelected}
            closeOnEscape={canDismiss}
            closeOnClickOutside={canDismiss}
            onDismiss={canDismiss ? dismissPopover : undefined}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            offset={1}
            arrowOffset={14}
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown>
                {isSelected && <ControlPopoverContent />}
            </Popover.Dropdown>
        </Popover>
    );
};
