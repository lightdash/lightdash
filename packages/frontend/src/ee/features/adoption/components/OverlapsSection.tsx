import { type DepartmentOverlaps } from '@lightdash/common';
import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { type FC, type RefObject } from 'react';
import InlineErrorState from '../../../../components/common/InlineErrorState';
import { type OverlapSelection } from '../utils/departmentDetail';
import { OverlapList } from './OverlapList';
import { VennDiagram } from './VennDiagram';

type Props = {
    overlaps: DepartmentOverlaps | null; // null until loaded
    isError: boolean;
    onRetry: () => void;
    selection: OverlapSelection | null;
    onSelect: (selection: OverlapSelection | null) => void;
    headingRef: RefObject<HTMLHeadingElement | null>; // where focus goes when the people filter is cleared
};

export const OverlapsSection: FC<Props> = ({
    overlaps,
    isError,
    onRetry,
    selection,
    onSelect,
    headingRef,
}) => {
    // Focusable from code only, never a tab stop
    const heading = (
        <Title order={5} ref={headingRef} tabIndex={-1}>
            Overlaps
        </Title>
    );
    if (overlaps === null) {
        return isError ? (
            <Stack gap="xs">
                {heading}
                <InlineErrorState
                    message="Overlaps couldn't be loaded"
                    onRetry={onRetry}
                />
            </Stack>
        ) : null;
    }
    // Nothing to show when no department outside this one shares its people
    if (overlaps.overlaps.length === 0) return null;
    const { department, venn } = overlaps;
    return (
        <Stack gap="xs">
            {heading}
            <Text fz="xs" c="dimmed">
                Departments outside this one that share people with it. Select a
                department or an area of the diagram to list those people below
            </Text>
            <SimpleGrid cols={{ base: 1, md: venn === null ? 1 : 2 }}>
                {venn !== null && (
                    <Paper p="md">
                        <VennDiagram
                            departmentUuid={department.departmentUuid}
                            venn={venn}
                            selection={selection}
                            onSelect={onSelect}
                        />
                    </Paper>
                )}
                <Paper p="md">
                    <OverlapList
                        overlaps={overlaps.overlaps}
                        selection={selection}
                        onSelect={onSelect}
                    />
                </Paper>
            </SimpleGrid>
        </Stack>
    );
};
