import { InlineErrorType, SummaryExplore } from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    Highlight,
    NavLink,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconTable,
} from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';
import { useItemDetail } from '../ExploreTree/TableTree/ItemDetailContext';
import {
    ItemDetailMarkdown,
    ItemDetailPreview,
} from '../ExploreTree/TableTree/ItemDetailPreview';

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
    const { showItemDetail, isItemDetailOpen } = useItemDetail();
    const [isHover, toggleHover] = useToggle();

    const onOpenDescriptionView = () => {
        toggleHover(false);
        showItemDetail({
            header: (
                <Group spacing="sm">
                    <MantineIcon icon={IconTable} size="lg" color="gray.7" />
                    <Text size="md">{explore.label}</Text>
                </Group>
            ),
            detail: <ItemDetailMarkdown source={explore.description ?? ''} />,
        });
    };

    if ('errors' in explore) {
        const showNoDimensionsIcon = explore.errors.every(
            (error) => error.type === InlineErrorType.NO_DIMENSIONS_FOUND,
        );
        const errorMessage = explore.errors
            .map((error) => error.message)
            .join('\n');

        return (
            <Tooltip withinPortal position="right" label={errorMessage}>
                <Box>
                    <NavLink
                        role="listitem"
                        disabled
                        icon={
                            <MantineIcon
                                icon={IconTable}
                                size="lg"
                                color="gray.7"
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
                                        color="gray.7"
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
            </Tooltip>
        );
    }

    return (
        <NavLink
            role="listitem"
            icon={<MantineIcon icon={IconTable} size="lg" color="gray.7" />}
            onClick={onClick}
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            label={
                <Popover
                    opened={isHover}
                    keepMounted={false}
                    shadow="sm"
                    withinPortal
                    disabled={!explore.description || isItemDetailOpen}
                    position="right"
                >
                    <Popover.Target>
                        <Highlight
                            component={Text}
                            highlight={query ?? ''}
                            truncate
                        >
                            {explore.label}
                        </Highlight>
                    </Popover.Target>
                    <Popover.Dropdown
                        p="xs"
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
                            description={explore.description}
                        />
                    </Popover.Dropdown>
                </Popover>
            }
        />
    );
};

export default ExploreNavLink;
