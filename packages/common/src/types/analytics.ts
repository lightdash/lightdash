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
    chartWeeklyQueryingUsers: {
        date: Date;
        num_7d_active_users: string;
        percent_7d_active_users: string;
    }[];
    chartWeeklyAverageQueries: {
        date: Date;
        average_number_of_weekly_queries_per_user: string;
    }[];
};
