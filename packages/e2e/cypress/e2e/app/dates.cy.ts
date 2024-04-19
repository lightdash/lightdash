import { SEED_PROJECT } from '@lightdash/common';
import dayjs = require('dayjs');

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
function getHourOffset() {
    const now = new Date('1 January, 2000'); // set specific date to avoid daylight savings
    const regex = /([+-]\d{4})/;
    const match = now.toTimeString().match(regex);

    // Check if we found a match
    if (match) {
        return match[1]; // eg: +0200
    }
    return null; // Return null if no match was found
}

function getLocalTime(datetime: string) {
    return dayjs(`${datetime} UTC`).format('YYYY-MM-DD HH:mm:ss');
}

describe('Date tests', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Check current timezone', () => {
        const now = new Date('1 January, 2000'); // set specific date to avoid daylight savings
        const timezone = Cypress.env('TZ');
        const offset = now.getTimezoneOffset();
        const errorMessage = `Timezone offset ${offset} doesn't match timezone ${timezone}. Are both env variables TZ and CYPRESS_TZ set ?`;
        switch (timezone) {
            case 'UTC':
                expect(offset, errorMessage).to.be.equal(0);
                expect(getHourOffset()).to.be.equal('+0000');
                expect(getLocalTime('2020-08-11 22:58:00')).to.be.equal(
                    '2020-08-11 22:58:00',
                );

                break;
            case 'Europe/Madrid':
                expect(offset, errorMessage).to.be.equal(-60);
                expect(getHourOffset()).to.be.equal('+0100');
                expect(getLocalTime('2020-08-11 22:58:00')).to.be.equal(
                    '2020-08-12 00:58:00',
                );
                break;
            case 'America/New_York':
                expect(offset, errorMessage).to.be.equal(300);
                expect(getHourOffset()).to.be.equal('-0500');
                expect(getLocalTime('2020-08-11 22:58:00')).to.be.equal(
                    '2020-08-11 18:58:00',
                );

                break;
            case 'Asia/Tokyo':
                expect(offset, errorMessage).to.be.equal(-540);
                expect(getHourOffset()).to.be.equal('+0900');
                expect(getLocalTime('2020-08-11 22:58:00')).to.be.equal(
                    '2020-08-12 07:58:00',
                );

                break;
            default:
                throw new Error(
                    `Invalid timezone (${timezone}) to test, please add CYPRESS_TZ to your env with a valid timezone`,
                );
        }
    });

    it('Should get right month on filtered chart', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved`);

        cy.contains('a', 'How many orders did we get on February?').click();

        cy.findByTestId('Filters-card-expand').click();
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.get('tbody td').contains('2018-02');
        cy.get('tbody td').contains('$415.00');
        cy.get('tbody td').contains('26');

        cy.findByTestId('Chart-card-expand').click(); // Collapse charts
        cy.findByTestId('SQL-card-expand').click();

        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('2018-02-01')`,
        );
    });

    it('Should use dashboard month filter', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wiat for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.get('.react-grid-layout').within(() => {
            cy.contains('How much revenue');
        });

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.contains('bank_transfer').should('have.length', 1);

        cy.get('.react-grid-layout').within(() => {
            cy.contains(`What's our total revenue to date?`)
                .parents('.react-grid-item')
                .contains('1,103');
        });

        // Add filter
        cy.contains('Add filter').click();
        cy.findByTestId('FilterConfiguration/FieldSelect')
            .click()
            .type('order date month{downArrow}{enter}');

        cy.contains('button', 'Select a date').click();
        cy.findAllByRole('dialog')
            .eq(1)
            .within(() => {
                cy.contains('button', new Date().getFullYear()).click();
                cy.get('button').find('[data-previous="true"]').click();
                cy.contains('button', 2018).click();
                cy.contains('button', 'Feb').click();
            });

        cy.contains('Apply').click();

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.get('.react-grid-layout').within(() => {
            cy.contains(`What's our total revenue to date?`)
                .parents('.react-grid-item')
                .contains('400');
        });
    });

    it('Should use UTC dates', () => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"exploreName"%3A""%2C"dimensions"%3A["events_timestamp_tz_raw"]%2C"metrics"%3A["events_count"]%2C"filters"%3A{"dimensions"%3A{"id"%3A"3b565490-87c5-4996-a42b-ff0640bb18cd"%2C"and"%3A[{"id"%3A"be863f3c-5807-48c5-9b6f-2e8445610280"%2C"target"%3A{"fieldId"%3A"events_timestamp_tz_raw"}%2C"operator"%3A"equals"%2C"values"%3A["2020-08-12T00%3A58%3A00%2B02%3A00"]}]}}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A500%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_count"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_count"]}%2C"eChartsConfig"%3A{"series"%3A[{"type"%3A"bar"%2C"yAxisIndex"%3A0%2C"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_count"}}}]}}}}`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );
        cy.contains('SQL');
        cy.findAllByText('Loading chart').should('have.length', 0);

        cy.contains('1 active filter');
        cy.findByTestId('Filters-card-expand').click();
        cy.contains('11 Aug 2020 22:58:00'); // Filter in UTC

        cy.contains(`2020-08-11, 22:58:00:000 (+00:00)`); // Data in results, this comes from the server, so depends on the server timezone

        // Time sensitive fields in localtime
        const timezone = Cypress.env('TZ');
        switch (timezone) {
            case 'UTC':
                cy.contains('2020-08-11 22:58:00'); // Filter in localtime //Timezone sensitive
                break;
            case 'Europe/Madrid':
                cy.contains('2020-08-12 00:58:00'); // Filter in localtime //Timezone sensitive
                break;
            case 'America/New_York':
                cy.contains('2020-08-11 18:58:00'); // Filter in localtime //Timezone sensitive
                break;
            case 'Asia/Tokyo':
                cy.contains('2020-08-12 07:58:00'); // Filter in localtime //Timezone sensitive
                break;
            default:
                throw new Error(
                    `Invalid timezone (${timezone}) to test, please add CYPRESS_TZ to your env with a valid timezone`,
                );
        }

        cy.findByTestId('SQL-card-expand').click();
        cy.contains(`("events".timestamp_tz) = ('2020-08-11 22:58:00')`); // SQL

        // TODO tooltip in charts
        // cy.get('svg g').trigger('mouseover')
        // cy.contains('2020-08-11 22:58:00');
    });

    it('Should filter by date on results table', () => {
        // This test should not be timezone sensitive
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );
        cy.contains('SQL');
        cy.findAllByText('Loading chart').should('have.length', 0);

        cy.findByTestId('Filters-card-expand').click();
        cy.findByTestId('SQL-card-expand').click();
        cy.findByTestId('Chart-card-expand').click(); // Close chart

        // Filter by year
        // FIXME tHis year seems wrong
        /* cy.get('tbody > :nth-child(1) > :nth-child(5)').click();
        cy.contains('Filter by 2018').click();
        cy.get('.mantine-YearPickerInput-input').contains('2018');
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('2018-01-01')`,
        ); 
        cy.get('.tabler-icon-x').click({ multiple: true });
*/
        // Filter by month
        cy.get('tbody > :nth-child(1) > :nth-child(4)').click();
        cy.contains('Filter by 2018-04').click();

        cy.get('.mantine-MonthPickerInput-input').contains('April 2018');
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('2018-04-01')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by week
        cy.get('tbody > :nth-child(1) > :nth-child(3)').click();
        cy.contains('Filter by 2018-04-09').click();
        cy.get('.mantine-DateInput-input').should(
            'have.value',
            'April 9, 2018',
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('2018-04-09')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by day
        cy.get('tbody > :nth-child(1) > :nth-child(2)').click();
        cy.contains('Filter by 2018-04-09').click();
        cy.get('.mantine-DateInput-input').should(
            'have.value',
            'April 9, 2018',
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('2018-04-09')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });
    });

    it('Should filter by datetimes on results table', () => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );
        cy.contains('SQL');
        cy.findAllByText('Loading chart').should('have.length', 0);

        cy.findByTestId('Filters-card-expand').click();
        cy.findByTestId('SQL-card-expand').click();
        cy.findByTestId('Chart-card-expand').click(); // Close chart

        // Filter by raw
        cy.get('tbody > :nth-child(1) > :nth-child(2)').click();
        cy.contains('Filter by 2020-08-11, 23:44:00:000 (+00:00)').click(); // Server Timezone sensitive
        cy.get('.mantine-DateTimePicker-input').contains(
            getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
        );
        cy.get('.mantine-Prism-code').contains(
            `("events".timestamp_tz) = ('2020-08-11 23:44:00')`,
        );

        cy.get('.tabler-icon-x').click({ multiple: true, force: true });
        // Filter by Milisecond
        // FIXME: selecting a different cell is not working
        cy.get('tbody > :nth-child(1) > :nth-child(3)').click();
        cy.contains('Filter by 2020-08-11, 23:44:00:000 (+00:00)').click(); // Server Timezone sensitive
        cy.get('.mantine-DateTimePicker-input').contains(
            getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('MILLISECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`, // Known Milisecond limitation
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by Second
        cy.get('tbody > :nth-child(1) > :nth-child(4)').click();
        cy.contains('Filter by 2020-08-11, 23:44:00 (+00:00)').click(); // Server Timezone sensitive
        cy.get('.mantine-DateTimePicker-input').contains(
            getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('SECOND', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });
        // Filter by Minute
        cy.get('tbody > :nth-child(1) > :nth-child(5)').click();
        cy.contains('Filter by 2020-08-11, 23:44 (+00:00)').click(); // Server Timezone sensitive
        cy.get('.mantine-DateTimePicker-input').contains(
            getLocalTime('2020-08-11 23:44:00'), // Timezone sensitive
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('MINUTE', "events".timestamp_tz)) = ('2020-08-11 23:44:00')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by Hour
        cy.get('tbody > :nth-child(1) > :nth-child(6)').click();
        cy.contains('Filter by 2020-08-11, 23 (+00:00)').click(); // Server Timezone sensitive
        cy.get('.mantine-DateTimePicker-input').contains(
            getLocalTime('2020-08-11 23:00:00'), // Timezone sensitive
        );
        cy.get('.mantine-Prism-code').contains(
            `(DATE_TRUNC('HOUR', "events".timestamp_tz)) = ('2020-08-11 23:00:00')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });
    });

    it('Should change dates on filters', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        cy.findByTestId('page-spinner').should('not.exist');
        cy.contains('No data available').should('be.visible');
        cy.contains('Pick a metric & select its dimensions').should(
            'be.visible',
        );
        cy.contains('Filters').should('be.visible');

        // Filter by year
        cy.get('[data-testid=Filters-card-expand]').click();
        cy.contains('Add filter').click();
        cy.contains('Created year').click();

        cy.contains('button', new Date().getFullYear()).click();
        cy.findByRole('dialog').within(() => {
            cy.get('button').find('[data-previous="true"]').click();
            cy.contains('button', 2017).click();
        });
        cy.get('[data-testid=SQL-card-expand]').click();
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('YEAR', "customers".created)) = ('2017-01-01')`,
        );

        cy.contains('button', 2017).click();
        cy.findByRole('dialog').within(() => {
            cy.contains('button', 2018).click();
        });
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('YEAR', "customers".created)) = ('2018-01-01')`,
        );

        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by month
        cy.contains('Add filter').click();
        cy.contains('Created month').click();

        cy.contains('button', dayjs().format('MMMM YYYY')).click();
        cy.findByRole('dialog').within(() => {
            cy.contains('button', dayjs().format('YYYY')).click();
            cy.get('button').find('[data-previous="true"]').click();
            cy.contains('button', 2017).click();
            cy.contains('button', 'Aug').click();
        });
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('MONTH', "customers".created)) = ('2017-08-01')`,
        );

        cy.contains('button', 'August 2017').click();
        cy.findByRole('dialog').within(() => {
            cy.contains('button', '2017').click();
            cy.contains('button', '2018').click();
            cy.contains('button', 'Sep').click();
        });
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('MONTH', "customers".created)) = ('2018-09-01')`,
        );

        cy.get('.tabler-icon-x').click({ multiple: true });
    });

    it('Should keep value when changing date operator', () => {
        const todayDate = new Date();

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/customers`);

        cy.findByTestId('page-spinner').should('not.exist');
        cy.contains('No data available').should('be.visible'); // Chart panel is opened by default but it takes some time to open it
        cy.get('[data-testid=Chart-card-expand]').click(); // Close chart
        cy.contains('Pick a metric & select its dimensions').should(
            'be.visible',
        );
        cy.contains('Filters').should('be.visible');

        cy.findAllByText('Loading chart').should('have.length', 0);
        // Filter by day
        cy.get('[data-testid=Filters-card-expand]').click();
        cy.contains('Add filter').click();
        cy.findByPlaceholderText('Search field...').type('created day');
        cy.contains('Created day').click();

        cy.get('.mantine-DateInput-root input').should(
            'have.value',
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        cy.get('[data-testid=SQL-card-expand]').click();
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('DAY', "customers".created)) = ('${getLocalISOString(
                todayDate,
            )}')`,
        );

        // Change date operator
        cy.get('[role="combobox"]').find('input[value="is"]').click();
        cy.get('[role="listbox"]')
            .findByRole('option', { name: 'is not' })
            .click();
        cy.get('[role="combobox"]')
            .find('input[value="is"]')
            .should('not.exist');
        cy.get('[role="combobox"]')
            .find('input[value="is not"]')
            .should('exist');

        // Keep same date
        cy.get('.mantine-DateInput-root input').should(
            'have.value',
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('DAY', "customers".created)) != ('${getLocalISOString(
                todayDate,
            )}')`,
        );

        cy.get('.tabler-icon-x').click({ multiple: true });
    });

    it('Should filter by date on dimension', () => {
        const now = dayjs();
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%2C%22metrics%22%3A%5B%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_day%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_day%22%2C%22orders_order_date_week%22%2C%22orders_order_date_month%22%2C%22orders_order_date_year%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_day%22%2C%22yField%22%3A%5B%22orders_order_date_week%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_day%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_order_date_week%22%7D%7D%2C%22type%22%3A%22bar%22%7D%5D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        cy.findByTestId('page-spinner').should('not.exist');
        cy.get('[data-testid=Chart-card-expand]').click(); // Close chart

        cy.contains('Filters').should('be.visible');

        // Open Date dimension
        cy.contains('Order date').click();

        // Filter by year
        cy.get('[data-testid=Filters-card-expand]').click();
        cy.get('[data-testid=tree-single-node-Year]').find('button').click();

        cy.findByRole('menuitem', { name: 'Add filter' }).click();

        cy.contains('button', now.format('YYYY'));
        cy.get('[data-testid=SQL-card-expand]').click();
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('YEAR', "orders".order_date)) = ('${now.format(
                'YYYY',
            )}-01-01')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by month
        cy.get('[data-testid=tree-single-node-Month]')
            .findByRole('button')
            .click();
        cy.findByRole('menuitem', { name: 'Add filter' }).click();

        cy.contains('button', now.format('MMMM YYYY'));
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('MONTH', "orders".order_date)) = ('${now.format(
                'YYYY',
            )}-${now.format('MM')}-01')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by week
        function startOfTheWeek(): Date {
            const curr = new Date();
            const first = curr.getDate() - curr.getDay();
            return new Date(curr.setDate(first));
        }

        const weekDate = startOfTheWeek();
        cy.get('[data-testid=tree-single-node-Week]')
            .findByRole('button')
            .click();
        cy.findByRole('menuitem', { name: 'Add filter' }).click();

        cy.get('.mantine-DateInput-root input').should(
            'have.value',
            dayjs(weekDate).format('MMMM D, YYYY'),
        );
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('WEEK', "orders".order_date)) = ('${getLocalISOString(
                weekDate,
            )}')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });

        // Filter by day
        cy.get('[data-testid=tree-single-node-Day]')
            .findByRole('button')
            .click();
        cy.findByRole('menuitem', { name: 'Add filter' }).click();

        const todayDate = now.toDate();

        cy.get('.mantine-DateInput-root input').should(
            'have.value',
            dayjs(todayDate).format('MMMM D, YYYY'),
        );
        cy.get('.mantine-Prism-root').contains(
            `(DATE_TRUNC('DAY', "orders".order_date)) = ('${getLocalISOString(
                todayDate,
            )}')`,
        );
        cy.get('.tabler-icon-x').click({ multiple: true });
    });

    it.skip('Should filter by datetime on dimension', () => {
        const exploreStateUrlParams = `?create_saved_chart_version={"tableName"%3A"events"%2C"metricQuery"%3A{"dimensions"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]%2C"metrics"%3A[]%2C"filters"%3A{}%2C"sorts"%3A[{"fieldId"%3A"events_timestamp_tz_raw"%2C"descending"%3Atrue}]%2C"limit"%3A1%2C"tableCalculations"%3A[]%2C"additionalMetrics"%3A[]}%2C"tableConfig"%3A{"columnOrder"%3A["events_timestamp_tz_raw"%2C"events_timestamp_tz_millisecond"%2C"events_timestamp_tz_second"%2C"events_timestamp_tz_minute"%2C"events_timestamp_tz_hour"]}%2C"chartConfig"%3A{"type"%3A"cartesian"%2C"config"%3A{"layout"%3A{"xField"%3A"events_timestamp_tz_raw"%2C"yField"%3A["events_timestamp_tz_millisecond"]}%2C"eChartsConfig"%3A{"series"%3A[{"encode"%3A{"xRef"%3A{"field"%3A"events_timestamp_tz_raw"}%2C"yRef"%3A{"field"%3A"events_timestamp_tz_millisecond"}}%2C"type"%3A"bar"}]}}}}`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/events${exploreStateUrlParams}`,
        );

        cy.findByTestId('Filters-card-expand').click();
        cy.findByTestId('SQL-card-expand').click();

        cy.findAllByText('Loading chart').should('have.length', 0);

        const checkDatetime = ($value, sqlFilter) => {
            const now = dayjs();
            const aSecondBefore = dayjs().subtract(1, 'seconds'); // Fix millisecond race condition
            const dateString = $value?.val();
            const inputDatetimeFormat = 'YYYY-MM-DD, HH:mm:ss:000';
            const expectedDatetimes = [
                now.format(inputDatetimeFormat),
                aSecondBefore.format(inputDatetimeFormat),
            ];
            expect(dateString).to.be.oneOf(expectedDatetimes);
            cy.get('.mantine-Prism-code').contains(
                `(${sqlFilter}) = ('${dayjs(dateString).format(
                    'YYYY-MM-DD HH:mm:ss',
                )}')`,
            );
        };
        // Open date dimension
        cy.contains('Timestamp tz').click();

        // Filter by raw
        cy.get('span:contains("Raw") ~ div').click();
        cy.get('.bp4-menu > :nth-child(1) > .bp4-menu-item').click();
        cy.get('.bp4-date-input input')
            .should('be.visible')
            .then(($value) => checkDatetime($value, '"events".timestamp_tz'));
        cy.get('.tabler-icon-x').click({ multiple: true });

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
        cy.get('.tabler-icon-x').click({ multiple: true });

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
        cy.get('.tabler-icon-x').click({ multiple: true });

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
        cy.get('.tabler-icon-x').click({ multiple: true });

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
        cy.get('.tabler-icon-x').click({ multiple: true });
    });
});
