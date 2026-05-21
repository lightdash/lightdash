import {
    OrganizationAccessStatus,
    type OrganizationAccess,
} from '@lightdash/common';
import { Center, Text } from '@mantine-8/core';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './TrialWarningBanner.module.css';

type Props = {
    access: OrganizationAccess;
};

export const TrialWarningBanner = ({ access }: Props) => {
    if (access.status !== OrganizationAccessStatus.TRIAL_WARNING) {
        return null;
    }

    return (
        <Center
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            px="md"
            bg="yellow.7"
            className={classes.banner}
        >
            <Text c="gray.9" size="sm" fw={700} truncate>
                Your Lightdash trial has expired. Contact sales@lightdash.com
            </Text>
        </Center>
    );
};
