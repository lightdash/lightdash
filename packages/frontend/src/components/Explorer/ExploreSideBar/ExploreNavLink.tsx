import {
    InlineErrorType,
    isSummaryExploreError,
    type SummaryExplore,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Highlight,
    HoverCard,
    NavLink,
    Text,
} from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconTable,
} from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';
import { TableItemDetailPreview } from '../ExploreTree/TableTree/ItemDetailPreview';
import WarningsHoverCardContent from '../WarningsHoverCard';

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

    const isError = isSummaryExploreError(explore);
    const warnings =
        !isError && 'warnings' in explore ? explore.warnings ?? [] : [];
    const hasWarnings = warnings.length > 0;
    const needsHoverCard = isError || hasWarnings;

    // Error-specific values
    const showNoDimensionsIcon =
        isError &&
        explore.errors.every(
            (error) => error.type === InlineErrorType.NO_DIMENSIONS_FOUND,
        );

    // Determine rightSection
    let rightSection;
    if (isError) {
        rightSection = showNoDimensionsIcon ? (
            <Anchor
                role="button"
                href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                target="_blank"
                rel="noreferrer"
            >
                <MantineIcon icon={IconInfoCircle} color="ldGray.7" size="lg" />
            </Anchor>
        ) : (
            <MantineIcon icon={IconAlertTriangle} size="lg" color="yellow.9" />
        );
    } else if (hasWarnings) {
        rightSection = (
            <MantineIcon icon={IconAlertTriangle} size="lg" color="yellow.9" />
        );
    }

    const navLink = (
        <NavLink
            role="listitem"
            disabled={isError}
            icon={<MantineIcon icon={IconTable} size="lg" color="ldGray.7" />}
            onClick={isError ? undefined : onClick}
            onMouseEnter={needsHoverCard ? undefined : () => toggleHover(true)}
            onMouseLeave={needsHoverCard ? undefined : () => toggleHover(false)}
            label={
                isError ? (
                    <Highlight
                        component={Text}
                        highlight={query ?? ''}
                        truncate
                    >
                        {explore.label}
                    </Highlight>
                ) : (
                    <TableItemDetailPreview
                        label={explore.label}
                        description={explore.description}
                        showPreview={needsHoverCard ? false : isHover}
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
                )
            }
            rightSection={rightSection}
        />
    );

    if (!needsHoverCard) {
        return navLink;
    }

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
                <Box>{navLink}</Box>
            </HoverCard.Target>
            <HoverCard.Dropdown maw={400} p="xs">
                {isError ? (
                    <WarningsHoverCardContent
                        type="errors"
                        warnings={explore.errors}
                    />
                ) : (
                    <WarningsHoverCardContent
                        type="warnings"
                        warnings={warnings}
                    />
                )}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default ExploreNavLink;
