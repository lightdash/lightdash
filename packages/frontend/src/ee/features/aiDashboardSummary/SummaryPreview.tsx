import { type DashboardSummary } from '@lightdash/common';
import { ActionIcon, Alert, Flex, Stack, Text, Tooltip } from '@mantine/core';
import { IconExclamationCircle, IconRefresh } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

type SummaryPreviewProps = {
    summary: DashboardSummary;
    dashboardVersionId: number;
    handleSummaryRegen: () => void;
};

const SummaryPreview: FC<SummaryPreviewProps> = ({
    summary,
    dashboardVersionId,
    handleSummaryRegen,
}) => {
    const relativeDate = useTimeAgo(summary.createdAt);

    return (
        <Stack align="flex-end">
            {dashboardVersionId !== summary.dashboardVersionId && (
                <Alert
                    color="orange"
                    w="100%"
                    icon={
                        <MantineIcon icon={IconExclamationCircle} size="lg" />
                    }
                >
                    Your dashboard has changed since this summary was generated.
                </Alert>
            )}
            <ReactMarkdownPreview
                source={summary.summary}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            />
            <Flex align="center" justify="space-between" mt="md" w="100%">
                <Text
                    color="gray.7"
                    fz="xs"
                >{`generated ${relativeDate}`}</Text>
                <Tooltip label="Regenerate summary" position="left">
                    <ActionIcon onClick={handleSummaryRegen} color="violet">
                        <MantineIcon icon={IconRefresh} />
                    </ActionIcon>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default SummaryPreview;
