import {
    type Dashboard,
    type DashboardControlSection,
    type DashboardFilterRule,
} from '@lightdash/common';
import { groupRulesBySection, isCollapsedByDefault } from './sections';

export type SectionChangeRow = {
    key: string;
    current: string | null;
    selected: string | null;
};

type DashboardSide = Pick<Dashboard, 'config' | 'filters'>;

const sectionsOf = (side: DashboardSide): DashboardControlSection[] =>
    side.config?.controlSections ?? [];

export const hasControlSections = (...sides: DashboardSide[]): boolean =>
    sides.some((side) => sectionsOf(side).length > 0);

// Position among the sections both versions share, so an added or removed
// section never reads as a reorder of the others; the fold as the bar reads it
const sectionLabel = (
    section: DashboardControlSection,
    shared: string[],
    memberCount: number,
): string => {
    const position = shared.indexOf(section.id);
    return [
        `"${section.name}"`,
        ...(position === -1 ? [] : [`position ${position + 1}`]),
        ...(isCollapsedByDefault(section, memberCount)
            ? ['collapsed by default']
            : []),
    ].join(', ');
};

const memberCounts = (side: DashboardSide): Map<string, number> =>
    new Map(
        groupRulesBySection(side.filters, sectionsOf(side)).flatMap(
            ({ section, rules }) =>
                section ? [[section.id, rules.length] as const] : [],
        ),
    );

// A dangling id is no section
const shownSection = (
    rule: DashboardFilterRule,
    sections: DashboardControlSection[],
): DashboardControlSection | null =>
    sections.find((section) => section.id === rule.sectionId) ?? null;

/** Section changes from the current dashboard to the selected version */
export const getSectionChangeRows = (
    current: DashboardSide,
    selected: DashboardSide,
    ruleLabel: (rule: DashboardFilterRule) => string,
): SectionChangeRow[] => {
    const currentSections = sectionsOf(current);
    const selectedSections = sectionsOf(selected);
    const selectedIds = new Set(selectedSections.map((section) => section.id));
    const sharedOrder = (sections: DashboardControlSection[]) =>
        sections
            .map((section) => section.id)
            .filter(
                (id) =>
                    selectedIds.has(id) &&
                    currentSections.some((section) => section.id === id),
            );
    const currentShared = sharedOrder(currentSections);
    const selectedShared = sharedOrder(selectedSections);

    const sectionIds = new Set(
        [...currentSections, ...selectedSections].map((section) => section.id),
    );
    const currentCounts = memberCounts(current);
    const selectedCounts = memberCounts(selected);
    const sectionRows = [...sectionIds]
        .map((id) => {
            const before = currentSections.find((section) => section.id === id);
            const after = selectedSections.find((section) => section.id === id);
            return {
                key: `section:${id}`,
                current: before
                    ? sectionLabel(
                          before,
                          currentShared,
                          currentCounts.get(id) ?? 0,
                      )
                    : null,
                selected: after
                    ? sectionLabel(
                          after,
                          selectedShared,
                          selectedCounts.get(id) ?? 0,
                      )
                    : null,
            };
        })
        .filter((row) => row.current !== row.selected);

    const rulesOf = (side: DashboardSide) => [
        ...side.filters.dimensions,
        ...side.filters.metrics,
    ];
    const selectedRules = rulesOf(selected);
    const moveRows = rulesOf(current).flatMap((rule) => {
        const after = selectedRules.find(({ id }) => id === rule.id);
        if (!after) return [];
        const from = shownSection(rule, currentSections);
        const to = shownSection(after, selectedSections);
        if ((from?.id ?? null) === (to?.id ?? null)) return [];
        const placed = (section: DashboardControlSection | null) =>
            section === null ? 'in no section' : `in "${section.name}"`;
        return [
            {
                key: `filter:${rule.id}`,
                current: `${ruleLabel(rule)} ${placed(from)}`,
                selected: `${ruleLabel(after)} ${placed(to)}`,
            },
        ];
    });

    return [...sectionRows, ...moveRows];
};
