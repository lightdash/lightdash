import { type GroupWithMembers } from '@lightdash/common';
import { type FC } from 'react';
import GroupsTable from './GroupsTable';

type GroupsViewProps = {
    onEditGroup: (group: GroupWithMembers) => void;
};

const GroupsView: FC<GroupsViewProps> = ({ onEditGroup }) => (
    <GroupsTable onEditGroup={onEditGroup} />
);

export default GroupsView;
