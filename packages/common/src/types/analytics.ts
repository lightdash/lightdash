export type UserWithCount = {
    userUuid: string;
    firstName: string;
    lastName: string;
    count: number;
};

export type UserActivity = {
    numberUsers: number;
    numberViewers: number;
    numberEditors: number;
    numberAdmins: number;
    numberWeeklyQueryingUsers: number;
    tableMostQueries: UserWithCount[];
    tableMostCreatedCharts: UserWithCount[];
    tableNoQueries: UserWithCount[];
    chartWeeklyQueryingUsers: any;
    chartWeeklyAverageQueries: any;
};
