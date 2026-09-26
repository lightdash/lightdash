import { Button, Tooltip } from '@mantine/core';
import { IconSchool } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';

/**
 * Navbar entry to the library, an icon beside notifications and help.
 * Project navigation decides when it shows.
 */
export const LearnLink: FC<{ projectUuid: string; withLabel?: boolean }> = ({
    projectUuid,
    withLabel = false,
}) => {
    const navigate = useNavigate();
    return (
        <Tooltip label="Learn" position="bottom" withinPortal>
            <Button
                aria-label="Learn"
                variant="default"
                size="xs"
                onClick={() => void navigate(`/projects/${projectUuid}/learn`)}
                // Navigation anchor for scope walkthroughs (data-tour-via).
                data-tour-nav="learn"
                data-tour-hint="Click Learn"
            >
                <MantineIcon icon={IconSchool} />
                {withLabel && 'Learn'}
            </Button>
        </Tooltip>
    );
};
