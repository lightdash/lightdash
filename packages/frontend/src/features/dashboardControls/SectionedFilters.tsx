import {
    interpolateUiString,
    type DashboardControlSection,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useId, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    selectDashboardFilters,
    useDashboardSelector,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import { AddControl } from './AddControl';
import { FilterPills } from './FilterPills';
import classes from './SectionedFilters.module.css';
import { groupRulesBySection } from './sections';
import { type PillPopoverState } from './ViewerSavedPills';

type CapsuleProps = {
    section: DashboardControlSection;
    /** Members shown on the tab in view */
    visibleRules: DashboardFilterRule[];
    isOpen: boolean;
    onToggle: () => void;
    activeTabUuid: string | undefined;
    popover: PillPopoverState;
};

/** A section with more members than this (on any tab) starts collapsed */
const COLLAPSED_BY_DEFAULT_ABOVE = 6;

const SectionCapsule: FC<CapsuleProps> = ({
    section,
    visibleRules,
    isOpen,
    onToggle,
    activeTabUuid,
    popover,
}) => {
    const getUiString = useUiStrings();
    const summaryId = useId();
    const setCount = visibleRules.filter(hasFilterValueSet).length;
    return (
        <Box className={classes.capsule} data-collapsed={!isOpen || undefined}>
            <UnstyledButton
                className={`${classes.toggle} mantine-focus-auto`}
                aria-expanded={isOpen}
                aria-describedby={isOpen ? undefined : summaryId}
                onClick={onToggle}
            >
                <MantineIcon
                    icon={isOpen ? IconChevronDown : IconChevronRight}
                    size={14}
                    color="dimmed"
                />
                <Text span fz="sm" fw={600}>
                    {section.name}
                </Text>
            </UnstyledButton>
            {/* Mounted on expand, so its pills arrive; `contents` keeps them
                in the capsule's own flow */}
            {isOpen ? (
                <Box display="contents" className={classes.pillsEnter}>
                    <FilterPills
                        activeTabUuid={activeTabUuid}
                        sectionId={section.id}
                        popover={popover}
                    />
                </Box>
            ) : (
                <Text span id={summaryId} fz="sm" c="dimmed">
                    {interpolateUiString(
                        getUiString('filters.sectionSummary'),
                        { set: setCount, total: visibleRules.length },
                    )}
                </Text>
            )}
        </Box>
    );
};

type Props = {
    activeTabUuid: string | undefined;
};

// The filter area of a dashboard with sections: the unsectioned
// pass first (Add, the unsectioned saved pills, the viewer's own), then one
// outlined capsule per section with a member on this tab: its toggle, then
// its pills inline. Collapsing is local state keyed by section id, as the
// ids whose state differs from their default; one saved popover is open across
// every pass
export const SectionedFilters: FC<Props> = ({ activeTabUuid }) => {
    const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const onPopoverClose = useCallback(() => setOpenPopoverId(undefined), []);
    const sections = useDashboardSelector(selectControlSections);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const isLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const { getTabsUsingFilter } = useFilterTabPlacement();

    const toggle = (id: string) =>
        setFlippedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // No groups while loading: the unsectioned pass shows the skeletons
    const groups = isLoading
        ? []
        : groupRulesBySection(dashboardFilters, sections).flatMap(
              ({ section, rules }) => {
                  if (section === null) return [];
                  const visibleRules = rules
                      .map(({ rule }) => rule)
                      .filter(
                          (rule) =>
                              !isFilterHiddenOnTab(
                                  getTabsUsingFilter(rule),
                                  activeTabUuid,
                              ),
                      );
                  return visibleRules.length === 0
                      ? []
                      : [{ section, rules, visibleRules }];
              },
          );
    const isOpen = (section: DashboardControlSection, total: number) =>
        !(total > COLLAPSED_BY_DEFAULT_ABOVE) !== flippedIds.has(section.id);
    // A popover in a collapsed or hidden section is closed with it
    const sectionOfOpenPopover = groupRulesBySection(
        dashboardFilters,
        sections,
    ).find(({ rules }) => rules.some(({ rule }) => rule.id === openPopoverId));
    const isPopoverShown =
        openPopoverId === undefined ||
        sectionOfOpenPopover === undefined ||
        sectionOfOpenPopover.section === null ||
        groups.some(
            ({ section, rules }) =>
                section.id === sectionOfOpenPopover.section?.id &&
                isOpen(section, rules.length),
        );
    const popover: PillPopoverState = {
        openPopoverId: isPopoverShown ? openPopoverId : undefined,
        onPopoverOpen: setOpenPopoverId,
        onPopoverClose,
    };

    return (
        <>
            <AddControl />
            <FilterPills
                activeTabUuid={activeTabUuid}
                sectionId={null}
                popover={popover}
            />
            {groups.map(({ section, rules, visibleRules }) => (
                <SectionCapsule
                    key={section.id}
                    section={section}
                    visibleRules={visibleRules}
                    isOpen={isOpen(section, rules.length)}
                    onToggle={() => toggle(section.id)}
                    activeTabUuid={activeTabUuid}
                    popover={popover}
                />
            ))}
        </>
    );
};
