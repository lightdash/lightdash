import { type DashboardControlSection } from '@lightdash/common';
import { Group, Select, Text } from '@mantine/core';
import { IconLayoutList } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';

const NO_SECTION = 'none';

/** A control's section, the one setting filters and parameters share. */
export const SectionSetting: FC<{
    sections: DashboardControlSection[];
    sectionId: string | null;
    onChange: (sectionId: string | null) => void;
}> = ({ sections, sectionId, onChange }) => {
    const getUiString = useUiStrings();
    // A Settings row, as `ViewerControls` draws Required and Lock
    return (
        <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={IconLayoutList} size="sm" color="ldGray.6" />
                <Text size="xs" fw={600}>
                    Section
                </Text>
            </Group>
            <Select
                size="xs"
                w={160}
                aria-label="Section"
                allowDeselect={false}
                data={[
                    { value: NO_SECTION, label: 'No section' },
                    ...sections.map((section) => ({
                        value: section.id,
                        label:
                            section.name ||
                            getUiString('filters.rail.untitledSection'),
                    })),
                ]}
                value={
                    sections.some(({ id }) => id === sectionId)
                        ? sectionId
                        : NO_SECTION
                }
                onChange={(next) => {
                    if (next === null) return;
                    onChange(next === NO_SECTION ? null : next);
                }}
            />
        </Group>
    );
};
