import {
    friendlyName,
    isDateFilterRule,
    isWithValueFilter,
    type CompiledMetric,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Code,
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import { Fragment, useState, type FC, type PropsWithChildren } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../../features/explorer/store';
import { rehypeRemoveHeaderLinks } from '../../../../utils/markdownUtils';
import { filterOperatorLabel } from '../../../common/Filters/FilterInputs/constants';
import MantineIcon from '../../../common/MantineIcon';

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
                color: theme.colors.ldGray[7],
                backgroundColor: 'transparent',
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
        compiledSql: string;
        name: string;
        filters?: CompiledMetric['filters'];
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

    const [showCompiled, setShowCompiled] = useState(false);

    return (
        <Stack spacing="xs">
            {metricInfo && (
                <>
                    <Group spacing="xs" position="apart">
                        <Text fz="sm" fw={500} c="ldDark.7">
                            {metricInfo.name}
                        </Text>
                        <Badge
                            radius="sm"
                            color="indigo"
                            p={2}
                            sx={(theme) => ({
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.indigo[1]}`,
                            })}
                        >
                            {friendlyName(metricInfo.type)}
                        </Badge>
                    </Group>
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
                        {metricInfo && (
                            <>
                                <Divider color="ldGray.2" />
                                <Text fz="xs" fw={500} c="ldDark.7">
                                    Description
                                </Text>
                            </>
                        )}

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
            {metricInfo && (
                <>
                    <Divider color="ldGray.2" />
                    <Stack spacing="xs">
                        <Group spacing="xs" align="center" position="apart">
                            <Text fz="xs" fw={500} c="ldDark.7">
                                SQL
                            </Text>
                            <Tooltip
                                variant="xs"
                                position="right"
                                label={
                                    showCompiled
                                        ? 'Show original SQL'
                                        : 'Show compiled SQL'
                                }
                            >
                                <Button
                                    compact
                                    variant="subtle"
                                    color="gray"
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        e.stopPropagation();
                                        setShowCompiled(!showCompiled);
                                    }}
                                    size="xs"
                                    leftIcon={<MantineIcon icon={IconCode} />}
                                >
                                    {showCompiled
                                        ? 'Original SQL'
                                        : 'Compiled SQL'}
                                </Button>
                            </Tooltip>
                        </Group>
                        <Code maw={400}>
                            {showCompiled
                                ? metricInfo.compiledSql
                                : metricInfo.sql}
                        </Code>
                        {metricInfo.filters &&
                            metricInfo.filters.length > 0 && (
                                <>
                                    <Divider color="ldGray.2" />
                                    <Text fz="xs" fw={500} c="ldDark.7">
                                        Filters
                                    </Text>
                                    {metricInfo.filters.map((filter) => {
                                        const operationLabel =
                                            filterOperatorLabel[
                                                filter.operator
                                            ];

                                        return (
                                            <Group key={filter.id} spacing={4}>
                                                <Code fz="xs" fw={500}>
                                                    {filter.target.fieldRef}
                                                </Code>
                                                <Text fz="xs" fw={500}>
                                                    {operationLabel}
                                                </Text>
                                                {}
                                                <Code fz="xs">
                                                    {isWithValueFilter(
                                                        filter.operator,
                                                    )
                                                        ? filter.values
                                                              ?.map(
                                                                  (value) =>
                                                                      value,
                                                              )
                                                              .join(', ')
                                                        : ''}
                                                    {isDateFilterRule(
                                                        filter,
                                                    ) && (
                                                        <Fragment>
                                                            {' '}
                                                            {filter.settings
                                                                ?.completed
                                                                ? 'completed'
                                                                : ''}
                                                            {
                                                                filter.settings
                                                                    ?.unitOfTime
                                                            }
                                                        </Fragment>
                                                    )}
                                                </Code>
                                            </Group>
                                        );
                                    })}
                                </>
                            )}
                    </Stack>
                </>
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
    const dispatch = useExplorerDispatch();

    const onOpenDescriptionView = () => {
        closePreview();
        dispatch(
            explorerActions.openItemDetail({
                itemType: 'table',
                label,
                description,
            }),
        );
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
