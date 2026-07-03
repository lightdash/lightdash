export type ContentOwner =
    | {
          type: 'user';
          userUuid: string;
          firstName: string;
          lastName: string;
          email: string;
      }
    | {
          type: 'group';
          groupUuid: string;
          name: string;
      };

export type ContentOwnershipInfo = {
    owner: ContentOwner;
    assignedAt: Date;
    assignedBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
};

export type ContentOwnerAssignment =
    | { type: 'user'; userUuid: string }
    | { type: 'group'; groupUuid: string };

export type UpdateContentOwnership = {
    owner: ContentOwnerAssignment | null;
};

export type ApiContentOwnershipResponse = {
    status: 'ok';
    results: ContentOwnershipInfo | null;
};
