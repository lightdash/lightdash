import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AppVersionHistoryPanel.module.css';

type Props = {
    label: string;
    ariaLabel: string;
    /** Dimmed one-liner beside the label; null shows the label alone. */
    summary: string | null;
    children: ReactNode;
};

/** A collapsed detail line under a history entry (build details, changes). */
const VersionHistoryDisclosure: FC<Props> = ({
    label,
    ariaLabel,
    summary,
    children,
}) => {
    const [open, setOpen] = useState(false);

    return (
        <Box>
            <UnstyledButton
                className={classes.disclosureToggle}
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={12}
                    className={classes.disclosureChevron}
                    data-open={open || undefined}
                />
                <Text fz="xs" fw={500} flex="0 0 auto">
                    {label}
                </Text>
                {summary && (
                    <Text className={classes.disclosureSummary} truncate="end">
                        {summary}
                    </Text>
                )}
            </UnstyledButton>
            {open && (
                <Box className={classes.disclosureContent}>{children}</Box>
            )}
        </Box>
    );
};

export default VersionHistoryDisclosure;
