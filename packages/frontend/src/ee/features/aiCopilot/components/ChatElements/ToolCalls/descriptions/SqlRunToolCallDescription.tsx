import { Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTerminal2 } from '@tabler/icons-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { AiSqlModal } from '../../AiSqlModal';
import {
    SqlApprovalActions,
    SqlExpandButton,
    type SqlApprovalReview,
    type SqlApprovalTarget,
} from '../SqlApprovalActions';
import { ToolCallSqlBlock } from '../ToolCallSqlBlock';
import { useSqlAutoApprove } from '../useSqlAutoApprove';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
    /** Present while the query waits on the user's approval. */
    approval?: SqlApprovalTarget;
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
    approval,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    const autoApprove = useSqlAutoApprove(approval?.threadUuid ?? null);
    const [expanded, { open, close }] = useDisclosure(false);
    const limitLabel = limit ? t('sqlRun.rowLimit', { limit }) : null;
    const review: SqlApprovalReview = approval
        ? {
              opened: expanded,
              onClose: close,
              sql,
              title: t('sqlRun.runSql'),
              icon: IconTerminal2,
              subtitle: limitLabel ?? t('sqlRun.reviewPrompt'),
          }
        : {
              opened: expanded,
              onClose: close,
              sql,
              title: t('sqlRun.sqlQuery'),
              icon: IconTerminal2,
              subtitle: limitLabel,
          };

    return (
        <Stack gap={6} align="stretch" w="100%">
            <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text c="dimmed" size="xs">
                    {limitLabel}
                </Text>
                {approval && autoApprove ? null : (
                    <SqlExpandButton onClick={open} />
                )}
            </Group>
            <ToolCallSqlBlock sql={sql} />
            {approval ? (
                <SqlApprovalActions {...approval} review={review} />
            ) : (
                <AiSqlModal {...review} copyPlacement="inline" />
            )}
        </Stack>
    );
};
