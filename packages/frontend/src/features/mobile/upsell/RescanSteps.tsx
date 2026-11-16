import { Text } from '@mantine/core';
import { IconDownload, IconQrcode, IconRefresh } from '@tabler/icons-react';
import { useId } from 'react';
import MantineIcon, {
    type MantineIconProps,
} from '../../../components/common/MantineIcon';
import { MOBILE_SIGN_IN_STRINGS } from '../mobileStrings';
import classes from './MobileUpsell.module.css';

const S = MOBILE_SIGN_IN_STRINGS.rescanSteps;

const STEPS: { key: string; icon: MantineIconProps['icon']; text: string }[] = [
    { key: 'scan', icon: IconQrcode, text: S.scan },
    { key: 'install', icon: IconDownload, text: S.install },
    { key: 'scanAgain', icon: IconRefresh, text: S.scanAgain },
];

export const RescanSteps = () => {
    const titleId = useId();
    return (
        <div className={classes.rescan}>
            <Text id={titleId} fz="xs" fw={500} c="dimmed">
                {S.title}
            </Text>
            <ol className={classes.rescanSteps} aria-labelledby={titleId}>
                {STEPS.map(({ key, icon, text }) => (
                    <li key={key} className={classes.rescanStep}>
                        <span
                            className={classes.rescanScreen}
                            aria-hidden="true"
                        >
                            <MantineIcon icon={icon} size={14} />
                        </span>
                        <Text fz="xs" lh="sm">
                            {text}
                        </Text>
                    </li>
                ))}
            </ol>
        </div>
    );
};
