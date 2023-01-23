export type UserWithCount = {
    userUuid: string;
    firstName: string;
    lastName: string;
    count: number;
};

export type UserActivity = {
    numberOfUsers: number;
    numberOfViewers: number;
    numberOfEditors: number;
    numberOfAdmins: number;
    weeklyQueryingUsers: string;
    usersWithMostQueries: UserWithCount[];
    usersCreatedMostCharts: UserWithCount[];
    usersNotLoggedIn: UserWithCount[];
    queriesPerWeek: any;
    averageUserQueriesPerWeek: any;
};
