import {
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
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';
import { getErrorTypeLabel } from './utils/errorTypeLabel';
import classes from './ValidationSummarySection.module.css';

const getGroupTitle = (
    group: ValidationErrorGroup,
    t: TFunction<'projectSettings'>,
): string => {
    if (group.errorType === ValidationErrorType.Model && group.tableName) {
        return group.sampleError.includes('failed to compile')
            ? t('validator.summary.modelFailedToCompile', {
                  tableName: group.tableName,
              })
            : t('validator.summary.modelNoLongerExists', {
                  tableName: group.tableName,
              });
    }
    const errorType = getErrorTypeLabel(group.errorType, t);
    if (group.fieldName) {
        return t('validator.summary.typeWithName', {
            errorType,
            name: group.fieldName,
        });
    }
    if (group.tableName) {
        return t('validator.summary.typeWithName', {
            errorType,
            name: group.tableName,
        });
    }
    return t('validator.summary.typeErrors', { errorType });
};

const getAffectedLabel = (
    group: ValidationErrorGroup,
    t: TFunction<'projectSettings'>,
): string => {
    const parts = [
        group.affectedCharts > 0 &&
            t('validator.counts.charts', { count: group.affectedCharts }),
        group.affectedDashboards > 0 &&
            t('validator.counts.dashboards', {
                count: group.affectedDashboards,
            }),
        group.affectedTables > 0 &&
            t('validator.counts.tables', { count: group.affectedTables }),
        group.affectedDataApps > 0 &&
            t('validator.counts.dataApps', { count: group.affectedDataApps }),
    ].filter(Boolean);
    return parts.join(t('validator.listSeparator'));
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
    const { t } = useTranslation('projectSettings');
    if (summary.groups.length === 0) return null;

    return (
        <Stack gap="xs">
            <Text fz="xs" fw={600} c="ldGray.7">
                {t('validator.summary.header', {
                    errors: t('validator.counts.errors', {
                        count: summary.totalErrors,
                    }),
                    items: t('validator.counts.items', {
                        count: summary.totalAffectedItems,
                    }),
                })}
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
                                                    {getGroupTitle(group, t)}
                                                </Text>
                                                <Text fz="xs" c="dimmed">
                                                    {getAffectedLabel(group, t)}
                                                </Text>
                                            </Stack>
                                        </Group>
                                    </UnstyledButton>
                                    {isDeletableModelGroup && (
                                        <Tooltip
                                            label={t(
                                                'validator.summary.deleteGroupTooltip',
                                            )}
                                        >
                                            <ActionIcon
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
