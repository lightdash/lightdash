import { friendlyName } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Code,
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import { type FC, type PropsWithChildren } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { rehypeRemoveHeaderLinks } from '../../../../utils/markdownUtils';
import MantineIcon from '../../../common/MantineIcon';
import { useItemDetail } from './useItemDetails';

/**
 * Renders markdown for an item's description, with additional constraints
 * to avoid markdown styling from completely throwing its surroundings out
 * of whack.
 */
export const ItemDetailMarkdown: FC<{ source: string }> = ({ source }) => {
    const theme = useMantineTheme();
    return (
        <ReactMarkdownPreview
            skipHtml
            components={{
                h1: ({ children }) => <Title order={2}>{children}</Title>,
                h2: ({ children }) => <Title order={3}>{children}</Title>,
                h3: ({ children }) => <Title order={4}>{children}</Title>,
            }}
            rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            rehypeRewrite={rehypeRemoveHeaderLinks}
            source={source}
            disallowedElements={['img']}
            style={{
                fontSize: theme.fontSizes.sm,
                color: theme.colors.gray[7],
            }}
        />
    );
};

/**
 * Renders a truncated version of an item's description, with an option
 * to read the full description if necessary.
 */
export const ItemDetailPreview: FC<{
    description?: string;
    onViewDescription: () => void;
    metricInfo?: {
        type: string;
        sql: string;
    };
}> = ({ description, onViewDescription, metricInfo }) => {
    /**
     * This value is pretty arbitrary - it's an amount of characters that will exceed
     * a single line, and for which the 'Read more' option should make sense, and not
     * be an annoyance.
     *
     * It's better to err on the side of caution, and show the 'Read more' option even
     * if unnecessarily so.
     */
    const isTruncated =
        (description && description.length > 180) ||
        (description && description.split('\n').length > 2);

    return (
        <Stack spacing="xs">
            {metricInfo && (
                <>
                    <Group spacing="xs">
                        <Text fz="xs" fw={500} c="dark.7">
                            Type:
                        </Text>
                        <Badge
                            radius="sm"
                            color="indigo"
                            sx={(theme) => ({
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.indigo[1]}`,
                            })}
                        >
                            {friendlyName(metricInfo.type)}
                        </Badge>
                    </Group>
                    <Divider color="gray.2" />
                    <Stack spacing="xs">
                        <Text fz="xs" fw={500} c="dark.7">
                            SQL
                        </Text>
                        <Code>{metricInfo.sql}</Code>
                    </Stack>
                </>
            )}
            {description && (
                <Box
                    mah={120}
                    sx={{
                        overflow: 'hidden',

                        // If we're over the truncation limit, use a mask to fade out the bottom of the container.
                        maskImage: isTruncated
                            ? 'linear-gradient(180deg, white 0%, white 80%, transparent 100%)'
                            : undefined,
                    }}
                >
                    <Stack spacing="xs">
                        {metricInfo && <Divider color="gray.2" />}

                        <ItemDetailMarkdown source={description} />
                    </Stack>
                </Box>
            )}
            {isTruncated && (
                <Box ta={'center'}>
                    <Anchor
                        size={'xs'}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                            e.preventDefault();
                            onViewDescription();
                        }}
                    >
                        Read full description
                    </Anchor>
                </Box>
            )}
        </Stack>
    );
};

/**
 * Helper for using ItemDetailPreview with tables or models.
 */
export const TableItemDetailPreview = ({
    showPreview,
    closePreview,
    label,
    description,
    /** Position offset for the preview popover */
    offset = 20,
    children,
}: PropsWithChildren<{
    showPreview: boolean;
    closePreview: () => void;
    description?: string;
    label: string;
    offset?: number;
}>) => {
    const { showItemDetail } = useItemDetail();

    const onOpenDescriptionView = () => {
        closePreview();
        showItemDetail({
            header: (
                <Group spacing="sm">
                    <MantineIcon icon={IconTable} size="lg" color="gray.7" />
                    <Text size="md">{label}</Text>
                </Group>
            ),
            detail: <ItemDetailMarkdown source={description ?? ''} />,
        });
    };

    return (
        <Popover
            opened={showPreview}
            keepMounted={false}
            shadow="sm"
            withinPortal
            disabled={!description}
            position="right"
            withArrow
            offset={offset}
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown
                /**
                 * Takes up space to the right, so it's OK to go fairly wide in the interest
                 * of readability.
                 */
                maw={500}
                /**
                 * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
                 * while interacting with the hovercard.
                 */
                onClick={(event) => event.stopPropagation()}
            >
                <ItemDetailPreview
                    onViewDescription={onOpenDescriptionView}
                    description={description}
                />
            </Popover.Dropdown>
        </Popover>
    );
};
