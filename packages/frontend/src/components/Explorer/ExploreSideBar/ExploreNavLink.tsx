import { InlineErrorType, type SummaryExplore } from '@lightdash/common';
import { Anchor, Box, Highlight, NavLink, Text, Tooltip } from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import React from 'react';
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
                        label={
                            <Highlight
                                component={Text}
                                highlight={query ?? ''}
                                truncate
                            >
                                {explore.label + 'hllo'}
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
