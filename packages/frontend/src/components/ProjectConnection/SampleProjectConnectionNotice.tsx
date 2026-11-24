import { FeatureFlags } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';

/** Shown in place of the connection form: the sample project's connection is fixed. */
export const SampleProjectConnectionNotice: FC = () => {
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const connectPath =
        newOnboardingFlag.data?.enabled === true
            ? '/onboarding/data-source'
            : '/createProject';

    return (
        <Callout variant="info" title="This project uses sample data">
            <Stack gap="sm" align="flex-start">
                <Text fz="sm">
                    Connect your data to create a project of your own. The
                    sample project stays as it is.
                </Text>
                <Button
                    component={Link}
                    to={connectPath}
                    size="xs"
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    Connect your data
                </Button>
            </Stack>
        </Callout>
    );
};
