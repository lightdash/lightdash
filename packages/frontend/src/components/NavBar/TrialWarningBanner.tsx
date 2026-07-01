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
    if (
        access.status !== OrganizationAccessStatus.TRIAL_WARNING &&
        access.status !== OrganizationAccessStatus.TRIAL_EXPIRED
    ) {
        return null;
    }

    const isExpired = access.status === OrganizationAccessStatus.TRIAL_EXPIRED;

    return (
        <Center
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            px="md"
            bg={isExpired ? 'red.7' : 'yellow.7'}
            className={classes.banner}
        >
            <Text
                c={isExpired ? 'white' : 'gray.9'}
                size="sm"
                fw={700}
                truncate
            >
                {isExpired
                    ? 'Your Lightdash trial has expired and queries are disabled. Contact sales@lightdash.com to reactivate.'
                    : 'Your Lightdash trial has expired. Contact sales@lightdash.com'}
            </Text>
        </Center>
    );
};
