import {
    friendlyName,
    ValidationErrorType,
    type ValidationErrorGroup,
    type ValidationGroupedSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './ValidationSummarySection.module.css';

const getGroupTitle = (group: ValidationErrorGroup): string => {
    if (group.errorType === ValidationErrorType.Model && group.tableName) {
        return group.sampleError.includes('failed to compile')
            ? `Model ${group.tableName} failed to compile`
            : `Model ${group.tableName} no longer exists`;
    }
    if (group.fieldName) {
        return `${friendlyName(group.errorType)}: ${group.fieldName}`;
    }
    if (group.tableName) {
        return `${friendlyName(group.errorType)}: ${group.tableName}`;
    }
    return `${friendlyName(group.errorType)} errors`;
};

const getAffectedLabel = (group: ValidationErrorGroup): string => {
    const parts = [
        group.affectedCharts > 0 &&
            `${group.affectedCharts} chart${
                group.affectedCharts === 1 ? '' : 's'
            }`,
        group.affectedDashboards > 0 &&
            `${group.affectedDashboards} dashboard${
                group.affectedDashboards === 1 ? '' : 's'
            }`,
        group.affectedTables > 0 &&
            `${group.affectedTables} table${
                group.affectedTables === 1 ? '' : 's'
            }`,
        group.affectedDataApps > 0 &&
            `${group.affectedDataApps} data app${
                group.affectedDataApps === 1 ? '' : 's'
            }`,
    ].filter(Boolean);
    return parts.join(', ');
};

type Props = {
    summary: ValidationGroupedSummary;
    activeGroupKey: string | null;
    onToggleGroup: (group: ValidationErrorGroup) => void;
    onDeleteGroup: (group: ValidationErrorGroup) => void;
};

export const ValidationSummarySection: FC<Props> = ({
    summary,
    activeGroupKey,
    onToggleGroup,
    onDeleteGroup,
}) => {
    if (summary.groups.length === 0) return null;

    return (
        <Stack gap="xs">
            <Text fz="xs" fw={600} c="ldGray.7">
                {summary.totalErrors} error
                {summary.totalErrors === 1 ? '' : 's'} across{' '}
                {summary.totalAffectedItems} item
                {summary.totalAffectedItems === 1 ? '' : 's'}, grouped by cause
            </Text>
            <ScrollArea scrollbars="x" offsetScrollbars>
                <Group gap="xs" wrap="nowrap">
                    {summary.groups.map((group) => {
                        const isActive = group.groupKey === activeGroupKey;
                        const isDeletableModelGroup =
                            group.errorType === ValidationErrorType.Model &&
                            group.tableName !== null &&
                            group.affectedCharts + group.affectedDashboards > 0;

                        return (
                            <Paper
                                key={group.groupKey}
                                withBorder
                                px="sm"
                                py={6}
                                className={
                                    isActive
                                        ? classes.groupCardActive
                                        : classes.groupCard
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <UnstyledButton
                                        onClick={() => onToggleGroup(group)}
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge
                                                variant="light"
                                                color={
                                                    group.errorType ===
                                                    ValidationErrorType.Model
                                                        ? 'red'
                                                        : 'orange'
                                                }
                                                size="sm"
                                            >
                                                {group.errorCount}
                                            </Badge>
                                            <Stack gap={0}>
                                                <Text
                                                    fz="xs"
                                                    fw={600}
                                                    className={classes.title}
                                                >
                                                    {getGroupTitle(group)}
                                                </Text>
                                                <Text fz={10} c="ldGray.6">
                                                    {getAffectedLabel(group)}
                                                </Text>
                                            </Stack>
                                        </Group>
                                    </UnstyledButton>
                                    {isDeletableModelGroup && (
                                        <Tooltip
                                            withinPortal
                                            label="Delete all content referencing this model"
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                onClick={() =>
                                                    onDeleteGroup(group)
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconTrash}
                                                    size="sm"
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Group>
                            </Paper>
                        );
                    })}
                </Group>
            </ScrollArea>
        </Stack>
    );
};
