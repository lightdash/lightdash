import { Text } from '@mantine/core';
import { IconArrowRight, IconDownload, IconLogin } from '@tabler/icons-react';
import { useId } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { MOBILE_SIGN_IN_STRINGS } from '../mobileStrings';
import classes from './MobileUpsell.module.css';

const S = MOBILE_SIGN_IN_STRINGS.rescanSteps;

export const RescanSteps = () => {
    const titleId = useId();
    return (
        <div className={classes.rescan}>
            <Text id={titleId} fz="xs" fw={500} c="dimmed">
                {S.title}
            </Text>
            <ol className={classes.rescanSteps} aria-labelledby={titleId}>
                <li className={classes.rescanStep}>
                    <span className={classes.rescanScreen} aria-hidden="true">
                        <MantineIcon icon={IconDownload} size={14} />
                    </span>
                    <Text fz="xs" lh="sm">
                        {S.install}
                    </Text>
                </li>
                <li className={classes.rescanArrow} aria-hidden="true">
                    <MantineIcon icon={IconArrowRight} size={14} />
                </li>
                <li className={classes.rescanStep}>
                    <span className={classes.rescanScreen} aria-hidden="true">
                        <MantineIcon icon={IconLogin} size={14} />
                    </span>
                    <Text fz="xs" lh="sm">
                        {S.signIn}
                    </Text>
                </li>
            </ol>
        </div>
    );
};
