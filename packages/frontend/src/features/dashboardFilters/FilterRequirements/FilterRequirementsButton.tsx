import {
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    Badge,
    Button,
    CloseButton,
    getDefaultZIndex,
    Group,
    Popover,
    Stack,
    Text,
    Textarea,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { clsx } from '@mantine/core';
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { Fragment, useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import classes from './FilterRequirements.module.css';
import FilterSelect, { type SelectableFilter } from './FilterSelect';
import { AndSeparator } from './RuleSeparators';
import { useFilterableItemsMap } from './useFilterableItemsMap';
import { useFilterBarPopovers } from './useFilterBarPopovers';
import { useUpdateDashboardFilterRule } from './useUpdateDashboardFilterRule';
import {
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
    getSelectableFilters,
    type FilterRequirementRule,
} from './utils';

type MemberChipProps = {
    item: FilterableItem | undefined;
    label: string;
    onRemove: () => void;
};

const MemberChip: FC<MemberChipProps> = ({ item, label, onRemove }) => (
    <Group gap={4} wrap="nowrap" className={classes.memberChip}>
        {item && <FieldIcon item={item} size="sm" />}
        <Text size="xs" truncate>
            {label}
        </Text>
        <CloseButton
            size="xs"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
        />
    </Group>
);

type RuleCardProps = {
    members: DashboardFilterRule[];
    selectableFilters: SelectableFilter[];
    getFilterLabel: (filterRule: DashboardFilterRule) => string;
    getFilterItem: (
        filterRule: DashboardFilterRule,
    ) => FilterableItem | undefined;
    onAddMember: (filterId: string) => void;
    onRemoveMember: (filterId: string) => void;
    onDeleteRule: () => void;
};

const RuleCard: FC<RuleCardProps> = ({
    members,
    selectableFilters,
    getFilterLabel,
    getFilterItem,
    onAddMember,
    onRemoveMember,
    onDeleteRule,
}) => (
    <Stack gap="xs" className={classes.ruleRow}>
        <Text size="xs" fw={500}>
            {members.length > 1
                ? 'Viewers must set at least one of:'
                : 'Viewers must set:'}
        </Text>
        <Group gap="xs">
            {members.map((member) => (
                <MemberChip
                    key={member.id}
                    item={getFilterItem(member)}
                    label={getFilterLabel(member)}
                    onRemove={() => onRemoveMember(member.id)}
                />
            ))}
            <FilterSelect
                selectableFilters={selectableFilters}
                placeholder={
                    members.length > 0 ? '+ or another filter' : '+ Add filter'
                }
                onSelect={onAddMember}
            />
            <Button
                size="compact-xs"
                variant="subtle"
                color="ldGray.6"
                ml="auto"
                leftSection={<MantineIcon icon={IconTrash} />}
                onClick={onDeleteRule}
            >
                Delete rule
            </Button>
        </Group>
    </Stack>
);

const FilterRequirementsButton: FC = () => {
    const isFilterRequirementsEnabled = useDashboardContext(
        (c) => c.isFilterRequirementsEnabled,
    );
    const [isLocalPopoverOpen, { open: openLocal, close: closeLocal }] =
        useDisclosure(false);
    const popovers = useFilterBarPopovers();
    const isPopoverOpen = popovers?.isRulesPopoverOpen ?? isLocalPopoverOpen;
    const open = popovers?.openRulesPopover ?? openLocal;
    const close = popovers?.closeRulesPopover ?? closeLocal;
    const [draftRuleIds, setDraftRuleIds] = useState<string[]>([]);

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const requiredFiltersNote = useDashboardContext(
        (c) => c.requiredFiltersNote,
    );
    const { track } = useTracking();
    const setRequiredFiltersNote = useDashboardContext(
        (c) => c.setRequiredFiltersNote,
    );
    // Edits are staged locally and only reach the dashboard context on Save;
    // closing the popover without saving discards them. null = no pending
    // edits. The note is also kept out of context while typing because every
    // context write re-renders the whole dashboard.
    const [noteDraft, setNoteDraft] = useState<string | null>(null);
    const [stagedRuleUpdates, setStagedRuleUpdates] = useState<Record<
        string,
        Partial<DashboardFilterRule>
    > | null>(null);

    const stageRuleUpdate = useCallback(
        (filterId: string, updates: Partial<DashboardFilterRule>) => {
            setStagedRuleUpdates((previous) => ({
                ...previous,
                [filterId]: { ...previous?.[filterId], ...updates },
            }));
        },
        [],
    );

    const savedRequirementRules = useMemo(
        () => getFilterRequirementRules(dashboardFilters),
        [dashboardFilters],
    );

    const fieldsMap = useFilterableItemsMap();

    const getFilterLabel = useCallback(
        (filterRule: DashboardFilterRule) =>
            getDashboardFilterRuleLabel(filterRule, fieldsMap),
        [fieldsMap],
    );

    const getFilterItem = useCallback(
        (filterRule: DashboardFilterRule) =>
            fieldsMap[filterRule.target.fieldId],
        [fieldsMap],
    );

    // Saved filters with staged edits applied on top; drives the rule cards
    // and eligibility so staged changes are visible before Save
    const allFilterRules = useMemo(() => {
        const saved = [
            ...dashboardFilters.dimensions,
            ...dashboardFilters.metrics,
        ];
        if (!stagedRuleUpdates) return saved;
        return saved.map((filterRule) =>
            stagedRuleUpdates[filterRule.id]
                ? { ...filterRule, ...stagedRuleUpdates[filterRule.id] }
                : filterRule,
        );
    }, [dashboardFilters, stagedRuleUpdates]);

    const requirementRules = useMemo(
        () =>
            stagedRuleUpdates
                ? getFilterRequirementRules({
                      dimensions: allFilterRules,
                      metrics: [],
                  })
                : savedRequirementRules,
        [stagedRuleUpdates, allFilterRules, savedRequirementRules],
    );

    const selectableFiltersFor = useCallback(
        (memberIds: string[]): SelectableFilter[] =>
            getSelectableFilters(allFilterRules, memberIds, fieldsMap),
        [allFilterRules, fieldsMap],
    );

    const updateFilterRule = useUpdateDashboardFilterRule();

    const handleAddRule = useCallback(() => {
        setDraftRuleIds((previous) => [...previous, uuidv4()]);
    }, []);

    const addMemberToGroup = useCallback(
        (groupId: string, filterId: string) => {
            // Rule members are valueless by definition
            stageRuleUpdate(filterId, {
                requiredGroupId: groupId,
                required: false,
                disabled: true,
                values: [],
            });
        },
        [stageRuleUpdate],
    );

    const handleAddMember = useCallback(
        (rule: FilterRequirementRule, filterId: string) => {
            const requiredSingleton = rule.members.find(
                (member) => member.required,
            );
            if (requiredSingleton) {
                // One-member rule expressed via `required`: convert it to a
                // shared rule before adding the sibling
                const groupId = uuidv4();
                addMemberToGroup(groupId, requiredSingleton.id);
                addMemberToGroup(groupId, filterId);
                return;
            }
            addMemberToGroup(rule.id, filterId);
        },
        [addMemberToGroup],
    );

    const handleAddMemberToDraft = useCallback(
        (draftId: string, filterId: string) => {
            addMemberToGroup(draftId, filterId);
            setDraftRuleIds((previous) =>
                previous.filter((id) => id !== draftId),
            );
        },
        [addMemberToGroup],
    );

    const [memberIdPendingRemoval, setMemberIdPendingRemoval] = useState<
        string | null
    >(null);

    const stageMemberRemoval = useCallback(
        (filterId: string) => {
            stageRuleUpdate(filterId, {
                required: false,
                requiredGroupId: undefined,
            });
        },
        [stageRuleUpdate],
    );

    const handleRemoveMember = useCallback(
        (filterId: string) => {
            // Removing the only member silently dissolves the rule, so that
            // one asks for confirmation
            const rule = requirementRules.find((requirementRule) =>
                requirementRule.members.some(
                    (member) => member.id === filterId,
                ),
            );
            if (rule && rule.members.length === 1) {
                setMemberIdPendingRemoval(filterId);
                return;
            }
            stageMemberRemoval(filterId);
        },
        [requirementRules, stageMemberRemoval],
    );

    const handleDeleteRule = useCallback(
        (rule: FilterRequirementRule) => {
            rule.members.forEach((member) =>
                stageRuleUpdate(member.id, {
                    required: false,
                    requiredGroupId: undefined,
                }),
            );
        },
        [stageRuleUpdate],
    );

    const hasStagedChanges = stagedRuleUpdates !== null || noteDraft !== null;

    const handleSave = useCallback(() => {
        if (stagedRuleUpdates) {
            Object.entries(stagedRuleUpdates).forEach(([filterId, updates]) =>
                updateFilterRule(filterId, updates),
            );
        }
        if (noteDraft !== null) {
            setRequiredFiltersNote(noteDraft);
        }
        track({
            name: EventName.DASHBOARD_FILTER_REQUIREMENTS_SAVED,
            properties: {
                dashboardUuid: dashboard?.uuid,
                ruleCount: requirementRules.length,
                memberCount: requirementRules.reduce(
                    (count, rule) => count + rule.members.length,
                    0,
                ),
                hasNote: (noteDraft ?? requiredFiltersNote ?? '').length > 0,
            },
        });
        setStagedRuleUpdates(null);
        setNoteDraft(null);
        setDraftRuleIds([]);
        close();
    }, [
        stagedRuleUpdates,
        noteDraft,
        updateFilterRule,
        setRequiredFiltersNote,
        close,
        track,
        dashboard?.uuid,
        requirementRules,
        requiredFiltersNote,
    ]);

    const handleClose = useCallback(() => {
        close();
        setStagedRuleUpdates(null);
        setNoteDraft(null);
        setDraftRuleIds([]);
        setMemberIdPendingRemoval(null);
    }, [close]);

    const requirementCount = savedRequirementRules.length;
    const hasRuleRows = requirementRules.length > 0 || draftRuleIds.length > 0;

    if (!isFilterRequirementsEnabled) {
        return null;
    }

    return (
        <Popover
            position="bottom-start"
            opened={isPopoverOpen}
            onClose={handleClose}
            onDismiss={handleClose}
            // The removal confirm modal portals outside the dropdown, so its
            // clicks would otherwise count as outside clicks and close the
            // popover, discarding staged edits
            closeOnClickOutside={memberIdPendingRemoval === null}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
            withinPortal
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    radius={100}
                    className={clsx(
                        classes.requirementsButton,
                        requirementCount > 0 &&
                            classes.requirementsButtonActive,
                    )}
                    rightSection={
                        requirementCount > 0 ? (
                            <Badge size="xs" color="yellow" autoContrast circle>
                                {requirementCount}
                            </Badge>
                        ) : undefined
                    }
                    onClick={() => (isPopoverOpen ? handleClose() : open())}
                >
                    Filter rules
                </Button>
            </Popover.Target>

            <Popover.Dropdown p={0}>
                <Stack w={400} gap="sm" p="md">
                    <Stack gap={2}>
                        <Text size="sm" fw={600}>
                            Filter rules
                        </Text>
                        <Text size="xs" c="ldGray.6">
                            Dashboard won't load until all rules are met.
                        </Text>
                    </Stack>
                    {!hasRuleRows && (
                        <Text size="xs" c="ldGray.6">
                            Require viewers to set filters before the dashboard
                            loads, either individually or at least one from a
                            set.
                        </Text>
                    )}
                    {requirementRules.map((rule, index) => (
                        <Fragment key={rule.id}>
                            {index > 0 && <AndSeparator />}
                            <RuleCard
                                members={rule.members}
                                selectableFilters={selectableFiltersFor(
                                    rule.members.map((member) => member.id),
                                )}
                                getFilterLabel={getFilterLabel}
                                getFilterItem={getFilterItem}
                                onAddMember={(filterId) =>
                                    handleAddMember(rule, filterId)
                                }
                                onRemoveMember={handleRemoveMember}
                                onDeleteRule={() => handleDeleteRule(rule)}
                            />
                        </Fragment>
                    ))}
                    {draftRuleIds.map((draftId, index) => (
                        <Fragment key={draftId}>
                            {(requirementRules.length > 0 || index > 0) && (
                                <AndSeparator />
                            )}
                            <RuleCard
                                members={[]}
                                selectableFilters={selectableFiltersFor([])}
                                getFilterLabel={getFilterLabel}
                                getFilterItem={getFilterItem}
                                onAddMember={(filterId) =>
                                    handleAddMemberToDraft(draftId, filterId)
                                }
                                onRemoveMember={handleRemoveMember}
                                onDeleteRule={() =>
                                    setDraftRuleIds((previous) =>
                                        previous.filter((id) => id !== draftId),
                                    )
                                }
                            />
                        </Fragment>
                    ))}
                    <Button
                        size="xs"
                        variant="subtle"
                        color="blue"
                        fullWidth
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleAddRule}
                    >
                        {hasRuleRows ? 'Add another rule' : 'Add rule'}
                    </Button>
                    {hasRuleRows && (
                        <Textarea
                            size="xs"
                            label="Note for viewers"
                            placeholder="Explain why these filters are required, e.g. pick your region to keep this dashboard fast"
                            autosize
                            minRows={2}
                            maxRows={4}
                            value={noteDraft ?? requiredFiltersNote ?? ''}
                            onChange={(event) =>
                                setNoteDraft(event.currentTarget.value)
                            }
                        />
                    )}
                </Stack>
                {(hasRuleRows || hasStagedChanges) && (
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.saveBar}
                    >
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                            />
                            <Text size="xs" c="ldGray.6">
                                Tiles stay locked until every rule is satisfied.
                            </Text>
                        </Group>
                        <Button
                            size="xs"
                            variant="filled"
                            disabled={!hasStagedChanges}
                            // Mouse saves on mousedown: with an inline dropdown
                            // open, Mantine's click-outside handling re-layouts
                            // on mousedown and the click never arrives. onClick
                            // keeps keyboard activation working; the save
                            // disables the button, so it cannot fire twice.
                            onMouseDown={(event) => {
                                if (event.button === 0) handleSave();
                            }}
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                    </Group>
                )}
                <MantineModal
                    opened={memberIdPendingRemoval !== null}
                    onClose={() => setMemberIdPendingRemoval(null)}
                    title="Remove filter rule?"
                    variant="delete"
                    // Modals default below popovers; lift it above the
                    // rules popover it is opened from
                    modalRootProps={{ zIndex: getDefaultZIndex('popover') }}
                    confirmLabel="Remove rule"
                    description="This is the only filter in this rule. Removing it deletes the rule, so viewers will no longer be required to set a filter before this dashboard loads."
                    onConfirm={() => {
                        if (memberIdPendingRemoval) {
                            stageMemberRemoval(memberIdPendingRemoval);
                        }
                        setMemberIdPendingRemoval(null);
                    }}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterRequirementsButton;
