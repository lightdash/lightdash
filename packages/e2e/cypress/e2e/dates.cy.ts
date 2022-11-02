import { SEED_PROJECT } from '@lightdash/common';
import moment = require('moment');

describe('Explore', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Check current timezone', () => {
        const now = new Date('1 January, 2000'); // set specific date to avoid daylight savings
        const timezone = Cypress.env('TZ');
        const offset = now.getTimezoneOffset();
        const errorMessage = `Timezone offset ${offset} doesn't match timezone ${timezone}. Are both env variables TZ and CYPRESS_TZ set ?`;
        switch (timezone) {
            case 'UTC':
                expect(offset, errorMessage).to.be.equal(0);
                break;
            case 'Europe/Madrid':
                expect(offset, errorMessage).to.be.equal(-60);
                break;
            case 'America/New_York':
                expect(offset, errorMessage).to.be.equal(300);
                break;
            case 'Asia/Tokyo':
                expect(offset, errorMessage).to.be.equal(-540);
                break;
            default:
                throw new Error(
                    `Invalid timezone (${timezone}) to test, please add CYPRESS_TZ to your env with a valid timezone`,
                );
        }
    });
    it('Should use UTC dates', () => {
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_status%22%2C%22customers_created_raw%22%5D%2C%22metrics%22%3A%5B%22orders_average_order_size%22%5D%2C%22filters%22%3A%7B%22dimensions%22%3A%7B%22id%22%3A%22927e8fc4-4a41-4972-8d15-57cb2060a1d2%22%2C%22and%22%3A%5B%7B%22id%22%3A%228cf33dc8-d62a-41fa-85c8-4078e028bd60%22%2C%22target%22%3A%7B%22fieldId%22%3A%22customers_created_raw%22%7D%2C%22operator%22%3A%22lessThan%22%2C%22values%22%3A%5B%222022-07-11T14%3A23%3A11.302Z%22%5D%7D%5D%7D%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22customers_created_raw%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22customers_created_raw%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_status%22%2C%22customers_created_raw%22%2C%22orders_average_order_size%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_status%22%2C%22yField%22%3A%5B%22orders_average_order_size%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22type%22%3A%22bar%22%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_status%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_average_order_size%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22customers_created_raw%22%2C%22value%22%3A%222017-02-11T03%3A00%3A00.000Z%22%7D%5D%7D%7D%7D%5D%2C%22legend%22%3A%7B%22show%22%3Atrue%2C%22type%22%3A%22plain%22%2C%22orient%22%3A%22horizontal%22%7D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.findByDisplayValue('2022-07-11, 14:23:11:000');
        cy.get('svg g text').contains('2017-02-11, 03:00:00:000 (+00:00)');
        cy.get('tbody td').contains('2017-02-11, 03:00:00:000 (+00:00)');
        cy.findByText('SQL').prev().click();
        cy.get('code')
            .invoke('text')
            .should(
                'include',
                '("customers".created) < (\'2022-07-11 14:23:11\')',
            );
    });

    it('Should filter by date on results table', () => {
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findByText('SQL').prev().click();

        cy.findAllByText('Loading chart').should('have.length', 0);
        // Filter by year
        cy.get('tbody > :nth-child(1) > :nth-child(5)').click();
        cy.contains('Filter by "2018"').click();
        cy.get('.bp4-numeric-input input').should('have.value', '2018');
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('2018-01-01')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by month
        cy.get('tbody > :nth-child(1) > :nth-child(4)').click();
        cy.contains('Filter by "2018-04"').click();
        cy.get('select option[label="January"]')
            .parent('select')
            .should('have.value', '3');
        cy.get('.bp4-numeric-input input').should('have.value', '2018');
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('2018-04-01')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by week
        cy.get('tbody > :nth-child(1) > :nth-child(3)').click();
        cy.contains('Filter by "2018-04-09"').click();
        cy.get('.bp4-date-input input').should('have.value', '2018-04-09');
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('2018-04-09')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by day
        cy.get('tbody > :nth-child(1) > :nth-child(2)').click();
        cy.contains('Filter by "2018-04-09"').click();
        cy.get('.bp4-date-input input').should('have.value', '2018-04-09');
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('2018-04-09')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });
    });

    it('Should filter by datetimes on results table', () => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findByText('SQL').prev().click();

        cy.findAllByText('Loading chart').should('have.length', 0);
        // Filter by raw
        cy.get('tbody > :nth-child(1) > :nth-child(2)').click();
        cy.contains('Filter by "2020-08-11, 23:44:00:000 (+00:00)').click();
        cy.get('.bp4-date-input input').should(
            'have.value',
            '2020-08-11, 23:44:00:000',
        );
        cy.get('.bp4-code').contains(
            `("events".timestamp_tz) = ('2020-08-11 23:44:00')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });
        // Filter by Milisecond
        cy.get('tbody > :nth-child(1) > :nth-child(3)').click();
        cy.contains('Filter by "2020-08-11, 23:44:00:000 (+00:00)').click();
        cy.get('.bp4-date-input input').should(
            'have.value',
            '2020-08-11, 23:44:00:000',
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('MILLISECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`, // Known Milisecond limitation
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by Second
        cy.get('tbody > :nth-child(1) > :nth-child(4)').click();
        cy.contains('Filter by "2020-08-11, 23:44:00 (+00:00)').click();
        cy.get('.bp4-date-input input').should(
            'have.value',
            '2020-08-11, 23:44:00:000',
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('SECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });
        // Filter by Minute
        cy.get('tbody > :nth-child(1) > :nth-child(5)').click();
        cy.contains('Filter by "2020-08-11, 23:44 (+00:00)').click();
        cy.get('.bp4-date-input input').should(
            'have.value',
            '2020-08-11, 23:44:00:000',
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('MINUTE', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by Hour
        cy.get('tbody > :nth-child(1) > :nth-child(6)').click();
        cy.contains('Filter by "2020-08-11, 23 (+00:00)').click();
        cy.get('.bp4-date-input input').should(
            'have.value',
            '2020-08-11, 23:00:00:000',
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('HOUR', "events".timestamp_tz)) = ('2020-08-11 23:00:00')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });
    });

    it('Should filter by date on dimension', () => {
        function leadingZero(value: string | number) {
            return `0${value}`.slice(-2);
        }
        function getFullMonth(date: Date) {
            return leadingZero(date.getMonth() + 1);
        }
        function getLocalISOString(date: Date) {
            return `${date.getFullYear()}-${getFullMonth(date)}-${leadingZero(
                date.getDate(),
            )}`;
        }
        const now = new Date();
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findByText('SQL').prev().click();

        cy.findAllByText('Loading chart').should('have.length', 0);
        // Filter by year
        cy.get('span:contains("Year") ~ div').click();

        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-numeric-input input').should(
            'have.value',
            now.getFullYear(),
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('${now.getFullYear()}-01-01')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by month
        cy.get('span:contains("Month") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('select option[label="January"]')
            .parent('select')
            .should('have.value', now.getMonth());
        cy.get('.bp4-numeric-input input').should(
            'have.value',
            now.getFullYear(),
        );
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('${now.getFullYear()}-${getFullMonth(
                now,
            )}-01')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by week
        function startOfTheWeek(): string {
            const curr = new Date();
            const first = curr.getDate() - curr.getDay();
            const firstday = new Date(curr.setDate(first));
            return getLocalISOString(firstday);
        }

        const weekDate = startOfTheWeek();
        cy.get('span:contains("Week") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click({
            force: true,
        });
        cy.get('.bp4-date-input input').should('have.value', weekDate);
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('${weekDate}')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by day
        cy.get('span:contains("Day") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();

        const todayDate = getLocalISOString(now);

        cy.get('.bp4-date-input input').should('have.value', todayDate);
        cy.get('.bp4-code').contains(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('${todayDate}')`,
        );
        cy.get('[icon="cross"]').click({ multiple: true });
    });

    it('Should filter by datetime on dimension', () => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findByText('SQL').prev().click();

        cy.findAllByText('Loading chart').should('have.length', 0);

        const checkDatetime = ($value, sqlFilter) => {
            const now = moment();
            const aSecondBefore = moment().subtract(1, 'seconds'); // Fix millisecond race condition
            const dateString = $value?.val();
            const inputDatetimeFormat = 'YYYY-MM-DD, HH:mm:ss:000';
            const expectedDatetimes = [
                now.format(inputDatetimeFormat),
                aSecondBefore.format(inputDatetimeFormat),
            ];
            expect(dateString).to.be.oneOf(expectedDatetimes);
            cy.get('.bp4-code').contains(
                `(${sqlFilter}) = ('${moment(dateString).format(
                    'YYYY-MM-DD HH:mm:ss',
                )}')`,
            );
        };

        // Filter by raw
        cy.get('span:contains("Raw") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) => checkDatetime($value, '"events".timestamp_tz'));
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by millisecond
        cy.get('span:contains("Millisecond") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) =>
                checkDatetime(
                    $value,
                    `DATE_TRUNC('MILLISECOND', "events".timestamp_tz)`,
                ),
            );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by second
        cy.get('span:contains("Second") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) =>
                checkDatetime(
                    $value,
                    `DATE_TRUNC('SECOND', "events".timestamp_tz)`,
                ),
            );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by minute
        cy.get('span:contains("Minute") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) =>
                checkDatetime(
                    $value,
                    `DATE_TRUNC('MINUTE', "events".timestamp_tz)`,
                ),
            );
        cy.get('[icon="cross"]').click({ multiple: true });

        // Filter by hour
        cy.get('span:contains("Hour") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) =>
                checkDatetime(
                    $value,
                    `DATE_TRUNC('HOUR', "events".timestamp_tz)`,
                ),
            );
        cy.get('[icon="cross"]').click({ multiple: true });
    });
});
