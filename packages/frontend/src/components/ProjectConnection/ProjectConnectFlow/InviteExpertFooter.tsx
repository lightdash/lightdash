import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router-dom';

const InviteExpertFooter: FC = () => (
    <Text color="dimmed" w={420} mx="auto" ta="center">
        This step is best carried out by your organization’s analytics experts.
        If this is not you,{' '}
        <Anchor component={Link} to="/generalSettings/userManagement?to=invite">
            invite them to Lightdash!
        </Anchor>
    </Text>
);

export default InviteExpertFooter;
