import { Badge, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import {
    UNAVAILABLE_COPY,
    UNAVAILABLE_SETTINGS_PATH,
    type DataAppAnalysisUnavailableReason,
} from './useDataAppAnalysisAvailability';

/**
 * Builder-side note next to the prompt context: the app under construction
 * renders AI analysis, but the org has it off, so viewers will see nothing.
 * Admins click through to the toggle.
 */
const AnalysisOffChip: FC<{ reason: DataAppAnalysisUnavailableReason }> = ({
    reason,
}) => {
    const { user } = useApp();
    const settingsPath = UNAVAILABLE_SETTINGS_PATH[reason];
    const canFix =
        settingsPath !== null &&
        (user.data?.ability.can('manage', 'Organization') ?? false);
    const label = `This app renders AI analysis. ${
        UNAVAILABLE_COPY[reason]
    } Viewers will see nothing until it is on. ${
        canFix
            ? 'Click to turn it on.'
            : 'Ask an organization admin to turn it on.'
    }`;
    const icon = <MantineIcon icon={IconSparkles} size={12} />;
    return (
        <Tooltip position="top" multiline w={280} label={label}>
            {canFix ? (
                <Badge
                    size="md"
                    color="yellow"
                    leftSection={icon}
                    component={Link}
                    to={settingsPath}
                    data-testid="analysis-off-chip"
                >
                    AI analysis off
                </Badge>
            ) : (
                <Badge
                    size="md"
                    color="yellow"
                    leftSection={icon}
                    data-testid="analysis-off-chip"
                >
                    AI analysis off
                </Badge>
            )}
        </Tooltip>
    );
};

export default AnalysisOffChip;
