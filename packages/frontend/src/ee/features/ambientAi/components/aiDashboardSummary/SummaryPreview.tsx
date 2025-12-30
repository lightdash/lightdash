import { type DashboardSummary } from '@lightdash/common';
import { Button, Flex, Stack, Text } from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';

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
                <Callout
                    variant="warning"
                    w="100%"
                    title="Your dashboard has changed since this summary was generated."
                />
            )}
            <ReactMarkdownPreview
                source={summary.summary}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
                style={{
                    backgroundColor: 'transparent',
                }}
            />
            <Flex align="center" justify="space-between" w="100%">
                <Text c="ldGray.7" fz="xs">{`Generated ${relativeDate}`}</Text>

                <Button
                    onClick={handleSummaryRegen}
                    radius="md"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                >
                    Regenerate summary
                </Button>
            </Flex>
        </Stack>
    );
};

export default SummaryPreview;
