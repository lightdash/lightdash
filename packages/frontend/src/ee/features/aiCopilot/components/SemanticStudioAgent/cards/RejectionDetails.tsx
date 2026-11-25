import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import classes from './RejectionDetails.module.css';

/** The check's or the warehouse's own words on a rejection, closed until asked for. */
export const RejectionDetails: FC<{ detail: string }> = ({ detail }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <Box>
            <UnstyledButton
                className={classes.toggle}
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
            >
                <MantineIcon
                    icon={isOpen ? IconChevronDown : IconChevronRight}
                    size={12}
                    color="dimmed"
                />
                <Text span fz="xs" c="dimmed">
                    Details
                </Text>
            </UnstyledButton>
            {isOpen ? (
                <Text fz="xs" c="dimmed" className={classes.detail}>
                    {detail}
                </Text>
            ) : null}
        </Box>
    );
};
