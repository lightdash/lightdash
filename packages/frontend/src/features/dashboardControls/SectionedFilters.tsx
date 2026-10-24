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
        <Box className={classes.capsule}>
            <UnstyledButton
                className={classes.toggle}
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
            {isOpen ? (
                <FilterPills
                    activeTabUuid={activeTabUuid}
                    sectionId={section.id}
                    popover={popover}
                />
            ) : (
                <Text id={summaryId} fz="sm" c="dimmed">
                    {interpolateUiString(
                        getUiString('filters.sectionSummary'),
                        {
                            set: setCount,
                            total: visibleRules.length,
                        },
                    )}
                </Text>
            )}
        </Box>
    );
};

type Props = {
    activeTabUuid: string | undefined;
};

// The view-mode filter area of a dashboard with sections: the unsectioned
// pass first (Add, the unsectioned saved pills, the viewer's own), then one
// capsule per section with a member on this tab. A fold is local state keyed
// by section id; one saved popover is open across every pass
export const SectionedFilters: FC<Props> = ({ activeTabUuid }) => {
    const [closedIds, setClosedIds] = useState<Set<string>>(() => new Set());
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const onPopoverClose = useCallback(() => setOpenPopoverId(undefined), []);
    const popover: PillPopoverState = {
        openPopoverId,
        onPopoverOpen: setOpenPopoverId,
        onPopoverClose,
    };
    const sections = useDashboardSelector(selectControlSections);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const isLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const { getTabsUsingFilter } = useFilterTabPlacement();

    const toggle = (id: string) =>
        setClosedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // No capsules while loading: the unsectioned pass shows the skeletons
    const capsules = isLoading
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
                      : [{ section, visibleRules }];
              },
          );

    return (
        <>
            <AddControl placement="bar" />
            <FilterPills
                activeTabUuid={activeTabUuid}
                sectionId={null}
                popover={popover}
            />
            {capsules.map(({ section, visibleRules }) => (
                <SectionCapsule
                    key={section.id}
                    section={section}
                    visibleRules={visibleRules}
                    isOpen={!closedIds.has(section.id)}
                    onToggle={() => toggle(section.id)}
                    activeTabUuid={activeTabUuid}
                    popover={popover}
                />
            ))}
        </>
    );
};
