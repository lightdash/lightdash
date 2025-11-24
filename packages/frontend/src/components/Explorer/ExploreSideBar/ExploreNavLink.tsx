import { InlineErrorType, type SummaryExplore } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    CopyButton,
    Highlight,
    HoverCard,
    NavLink,
    Text,
} from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconCopy,
    IconInfoCircle,
    IconTable,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { TableItemDetailPreview } from '../ExploreTree/TableTree/ItemDetailPreview';

type ExploreNavLinkProps = {
    explore: SummaryExplore;
    query?: string;
    onClick: () => void;
};

const ExploreNavLink: React.FC<ExploreNavLinkProps> = ({
    explore,
    query,
    onClick,
}: ExploreNavLinkProps) => {
    const [isHover, toggleHover] = useToggle();
    const [showCopyButton, setShowCopyButton] = useState(false);

    if ('errors' in explore) {
        const showNoDimensionsIcon = explore.errors.every(
            (error) => error.type === InlineErrorType.NO_DIMENSIONS_FOUND,
        );
        const errorMessage = explore.errors
            .map((error) => error.message)
            .join('\n');

        return (
            <HoverCard
                withinPortal
                position="right"
                withArrow
                radius="md"
                shadow="subtle"
                variant="xs"
            >
                <HoverCard.Target>
                    <Box>
                        <NavLink
                            role="listitem"
                            disabled
                            icon={
                                <MantineIcon
                                    icon={IconTable}
                                    size="lg"
                                    color="ldGray.7"
                                />
                            }
                            label={
                                <Highlight
                                    component={Text}
                                    highlight={query ?? ''}
                                    truncate
                                >
                                    {explore.label}
                                </Highlight>
                            }
                            rightSection={
                                showNoDimensionsIcon ? (
                                    <Anchor
                                        role="button"
                                        href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            color="ldGray.7"
                                            size="lg"
                                        />
                                    </Anchor>
                                ) : (
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        size="lg"
                                        color="yellow.9"
                                    />
                                )
                            }
                        />
                    </Box>
                </HoverCard.Target>
                <HoverCard.Dropdown maw={300} p="xs">
                    <Box
                        position="relative"
                        p="md"
                        sx={(theme) => ({
                            backgroundColor: theme.colors.ldGray[0],
                            maxHeight: 200,
                            overflow: 'auto',
                        })}
                        onMouseEnter={() => {
                            setShowCopyButton(true);
                        }}
                        onMouseLeave={() => {
                            setShowCopyButton(false);
                        }}
                    >
                        <CopyButton value={errorMessage}>
                            {({ copy, copied }) => (
                                <ActionIcon
                                    onClick={copy}
                                    size="xs"
                                    variant="light"
                                    sx={() => ({
                                        position: 'absolute',
                                        display: showCopyButton
                                            ? 'block'
                                            : 'none',
                                        right: 12,
                                        top: 12,
                                    })}
                                >
                                    <MantineIcon
                                        color={copied ? 'green' : 'gray'}
                                        icon={IconCopy}
                                    />
                                </ActionIcon>
                            )}
                        </CopyButton>
                        <Text fz="xs" sx={{ wordBreak: 'break-word' }}>
                            {errorMessage}
                        </Text>
                    </Box>
                </HoverCard.Dropdown>
            </HoverCard>
        );
    }

    return (
        <NavLink
            role="listitem"
            icon={<MantineIcon icon={IconTable} size="lg" color="ldGray.7" />}
            onClick={onClick}
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            label={
                <TableItemDetailPreview
                    label={explore.label}
                    description={explore.description}
                    showPreview={isHover}
                    closePreview={() => toggleHover(false)}
                    offset={0}
                >
                    <Highlight
                        component={Text}
                        highlight={query ?? ''}
                        truncate
                    >
                        {explore.label}
                    </Highlight>
                </TableItemDetailPreview>
            }
        />
    );
};

export default ExploreNavLink;
