import { Anchor, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { Link } from 'react-router';

const InviteExpertFooter: FC = () => (
    <Text c="dimmed" w={420} mx="auto" ta="center">
        This step is best carried out by your organization's analytics experts.
        If this is not you,{' '}
        <Anchor component={Link} to="/generalSettings/userManagement?to=invite">
            invite them to Lightdash!
        </Anchor>
    </Text>
);

export default InviteExpertFooter;
