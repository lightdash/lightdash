// eslint-disable-next-line import/prefer-default-export
export enum TimeFrames {
    RAW = 'RAW',
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    QUARTER = 'QUARTER',
    YEAR = 'YEAR',
    HOUR = 'HOUR',
    MINUTE = 'MINUTE',
    SECOND = 'SECOND',
    MILLISECOND = 'MILLISECOND',
    MONTH_NUM = 'MONTH_NUM',
    MONTH_NAME = 'MONTH_NAME',
}

/*
## Dates

RAW
MILLISECOND
SECOND
MINUTE
HOUR
DAY
WEEK
MONTH
QUARTER
YEAR

## Numbers

day_of_week_index |	2  (0 = Monday, 6 = Sunday)
day_of_month_num | 20
month_num |	9
quarter_num	| 2
year_num | 2017

## Strings

day_of_week_name | Wednesday
month_name | September
quarter_name |	Q2

???? these don't seem to fit the naming convention
year_and_quarter | 2018-Q2
year_and_month | 2018-05

 */
