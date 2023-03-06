import { Knex } from 'knex';

export const EmailOneTimePasscodesTableName = 'email_one_time_passcodes';

export type DbEmailOneTimePasscode = {
    email_id: number;
    passcode: string;
    created_at: Date;
    number_of_attempts: number;
};

export type DbEmailOneTimePasscodeIn = Pick<
    DbEmailOneTimePasscode,
    'email_id' | 'passcode'
>;

export type DbEmailOneTimePasscodeUpdate = Pick<
    DbEmailOneTimePasscode,
    'number_of_attempts'
>;
export type EmailOneTimePasscodeTable = Knex.CompositeTableType<
    DbEmailOneTimePasscode,
    DbEmailOneTimePasscodeIn,
    DbEmailOneTimePasscodeUpdate
>;
