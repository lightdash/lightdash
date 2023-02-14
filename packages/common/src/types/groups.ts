export type Group = {
    /**
     * The group's UUID
     */
    uuid: string;
    /**
     * A friendly name for the group
     */
    name: string;
    /**
     * The time that the group was created
     */
    createdAt: Date;
    /**
     * The UUID of the organization that the group belongs to
     */
    organizationUuid: string;
};

export type CreateGroup = {
    name: string;
    organizationUuid: string;
};

/**
 * A summary for a Lightdash user within a group
 */
export type GroupMember = {
    /**
     * Unique id for the user
     * @format uuid
     */
    userUuid: string;
    /**
     * Primary email address for the user
     */
    email: string;
    /**
     * The user's first name
     */
    firstName: string;
    /**
     * The user's last name
     */
    lastName: string;
};

export type GroupMembership = {
    groupUuid: string;
    userUuid: string;
};

/**
 * Details for a group including a list of the group's members.
 */
export type GroupWithMembers = Group & {
    /**
     * A list of the group's members.
     */
    members: GroupMember[];
};

export type ApiGroupResponse = {
    status: 'ok';
    results: Group;
};
