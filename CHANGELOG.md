# [0.13.0](https://github.com/lightdash/lightdash/compare/0.12.1...0.13.0) (2022-02-08)


### Bug Fixes

* fatal error when results are empty ([#1302](https://github.com/lightdash/lightdash/issues/1302)) ([10568b2](https://github.com/lightdash/lightdash/commit/10568b27cc723c93419dc9f49eb4b18d3af33054))


### Features

* **#186:** add metric filters ([#1271](https://github.com/lightdash/lightdash/issues/1271)) ([df3e5dc](https://github.com/lightdash/lightdash/commit/df3e5dc5794351ca4f86195a85d6006b06c0134e)), closes [#186](https://github.com/lightdash/lightdash/issues/186)
* **#205:** add in the past filter ([#1290](https://github.com/lightdash/lightdash/issues/1290)) ([08c97dc](https://github.com/lightdash/lightdash/commit/08c97dca56e7249c19beed16edf4e4a1d75d7490)), closes [#205](https://github.com/lightdash/lightdash/issues/205)

# Changelog

Recent and upcoming changes to lightdash

## Unreleased

## [0.12.1] - 2022-02-02
### Added
- Added new 'table' chart type

### Changed
- Minor UI changes in the explore view
- Categorical charts now include a new tooltip showing category names

### Fixed
- Fixed bug with generated SQL for string filters
- 

## [0.12.0] - 2022-02-01
### Added
- Filters can now be added from the sidebar (#1260)
- Added auto complete to filters (#1263)

## [0.11.11] - 2022-01-28
### Added
- Added ssl "no-verify" option for postgres and redshift connections (#1253)

### Fixed
- Fixed deployments with local dbt project (#1258)

## [0.11.10] - 2022-01-26
### Added
- The column title within the results table now displays a tooltip with the metric/dimension description (#1136)
- Show message for the user to know that their project most be compatible with dbt v1 (#1043)
- Filtering and search are now available in the tables side bar (#817 #997)
- Use Google SSO to set up initial user (#1149)
- Invited users can create an account with Google SSO (#1148)
- Social authentications can now be revoked (#1152)
- Organisation basic roles and permissions are now available (#1069)
- Option to have email domain validation (#1221)
- Added option to disable password authentication (#1234)
- Allow user to revoke Google auth (#1232)

### Changed
- Update table icons to avoid confusion (#1182)

### Fixed
- Api request validation not working (#619)
- Removes site url warning in dev mode (#1189)
- Get columns from all snowflake databases and schemas(#1223, #1127)

## [0.11.9] - 2022-01-18
### Fixed
- Fixed fatal error when trying to connect a project (#1168)

## [0.11.8] - 2022-01-17
### Added
- Adds the `SITE_URL` environment variable used to configure all links in the app (#1118)
- We now have a warning when a user connects via mobile devices (#1110)
- We now collect the user job title (#1120)
- You can now login with your Google account (#1140)
- Users can now reset forgotten passwords (#1119)
- Adds `PGMINCONNECTIONS` and `PGMAXCONNECTIONS` environment variable to customize pg pool size (#1157)

### Changed
- Move save chart buttons to the chart section (#1141)

### Fixed
- Align latest saved chart names (#1137)
- Fixed support for type NUMBER() and VARCHAR() in snowflake (#1144)
- Apply custom labels to time interval dimensions (#1146)
- Charts will resize with the screen (#1142)
- Add field validation to project form (#1145)

## [0.11.7] - 2022-01-07
### Added
- Added support for custom labels for explores/model, metrics and dimensions (#1061)
- Added support for dbt metric label (#1061)

### Changed
- Replaced dbt-spark[ODBC] adapter with dbt-databricks (#1104)

### Fixed
- Fix redshift connections to work with any ssl mode (#1057)
- Fix connection to databricks during dbt compile (#1104)

## [0.11.6] - 2021-12-24
### Fixed
- Remove quotation from time interval sql for bigquery (#1063)

## [0.11.5] - 2021-12-23
### Fixed
- Use datetime_trunc instead of date_trunc for timestamps in bigquery (#1059)
- Stop project from compiling multiple times (#1060)
- Fix docker compose yml version (#1052)

## [0.11.4] - 2021-12-22
### Added
- Be able to turn off the time interval dimensions (#1044)

### Changed
- Changed the git clone process to only clone the dbt directory (#1038)
- Set time interval dimensions by default (#1044)

## [0.11.3] - 2021-12-20
### Added
- Add support for BitBucket (#1026)
- Improved messages and invalid states in explore page (#1008)
- Temporary script to replace user passwords (#1017)
- Add support widget (#987)

### Changed
- Replaced timestamp default time interval 'millisecond' for 'raw' (#1036)

### Fixed
- Fix sql join logic to include tables from filtered dimensions (#1036)

## [0.11.2] - 2021-12-15
### Fixed
- Refresh explore dimensions and metrics after project compiles (#991)
- Fix chart when grouping by boolean dimension (#992)
- Fix dashboard page to be full width again (#993)

## [0.11.1] - 2021-12-14
### Added
- You can edit the saved chart name from the explore page (#978)
- Added footer to all pages (#981)

### Fixed
- Add correct state when sql runner has an error (#974)
- Fix latest saved charts to be full width (#971)
- Docker containers created via the install script can now be restarted via docker (#973)

## [0.11.0] - 2021-12-08
### Added
- Metrics defined under the `metrics: ` tag in dbt projects are imported to Lightdash (#926)
 
### Changed
- Lightdash projects must be compatible with dbt version 1.0.0 (#926)
- Saved charts in homepage are ordered by the most recently updated first (#956)
- Improved loading states throughout the app (#967)

## [0.10.8] - 2021-12-07
### Added
- Added a home page where we display a few onboarding steps and the latest dashboards and saved charts in you organisation (#949)
- Added a logger that provides more detailed logs and stores them in local files (#943)

## [0.10.7] - 2021-12-02
### Added
- Support self hosted gitlab repositories (#931)

### Fixed
- Log unhandled rejections and uncaught exceptions (#930)

## [0.10.6] - 2021-12-01
### Fixed
- Fix unhandled errors & improve error messages (#919 #923 #925)

## [0.10.5] - 2021-11-30
### Added
- Show how long ago the dashboard data was refreshed (#885)
- You can now configure what date and time intervals you want for your dimensions (#895)

### Changed
- We now only join tables if the user selected fields from them (#905)

## [0.10.4] - 2021-11-24
### Fixed
- Fix bug where the user could not pass the login page (#881)
- Fix bug where ran a query without dimensions or metrics (#876)
- Improved performance in the dashboard page (#875)

## [0.10.3] - 2021-11-22
### Added
- Dashboards now have a distinct view and edit mode
- You can now add text and images to your dashboards using markdown tiles
- You can now add loom videos to your dashboards using loom tiles
- Ability to rename a dashboard from the dashboard page
- Ability to add a chart to a dashboard from the explore page

## [0.10.2] - 2021-11-17
### Fixed
- Show base table at the top of the sidebar (#830)
- Fix bug where tables in the SQL runner page would overflow (#827)
- Fix bug where tables and results wouldn't refresh after updating the project connections (#828)
- Other small UI fixes (#823 #826 #829 #831 #832 #835 #837 #838 #839)

## [0.10.1] - 2021-11-15
### Added
- We now provide example metrics for those tables that you haven't defined any metrics (#794)
- You can pick the dbt models you want to appear as tables in Lightdash (#811)

## [0.10.0] - 2021-11-12
### Added
- Project settings can be access from the explore menu (#774)
- You can now click through from a chart on a dashboard tile to the edit view for that chart (#785)

### Changed
- Compile times are now faster: (#805)
- Various improvements to developer experience: (#793), (#800)
- Lightdash will now use a dbt profile name of `prod` by default (#802)

### Fixed
- Fix chart config where it was possible to remove the only line on a chart (#722)
- Various UI improvements (#778), (#776), (#787), (#788), (#806)
- Fixed a bug where the url would not change when changing explores (#779)
- Fixed a bug where the sidebar would shrink for large sets of results in the explorer (#784), (#795)
- Results tables with many columns are now horizontally scrollable rather than overflowing the display (#783)
- `lightdash.yml` files are now valid without any projects defined (#733)

### Removed
- Users may no longer specify Lightdash projects in their `lightdash.yml` project (#792)

## [0.9.4] - 2021-11-09
### Added
- You can now run raw SQL queries using the SQL Runner and visualise the results as a table
- Added support for Databricks

### Fixed
- Fixed bug in time series charts using multiple series

### Removed
- Projects connecting to dbt cloud are no longer available through the UI

## [0.9.3] - 2021-11-05
### Added
- Charts can now be exported as an eCharts JSON definition

### Fixed
- Fixed error where dbt projects using version 0.21.0 would have missing joins

## [0.9.2] - 2021-11-04
### Changed
- Lightdash requires dbt version 0.21.0 or higher

### Fixed
- Time-series charts fixed to show all values at the correct point in time

### Removed
- Authorising with Google Cloud OAuth is no longer possible with local dbt projects

## [0.9.1] - 2021-11-02
### Changed
- Warehouse credentials are now required
- We now fetch the catalog directly from the warehouse instead of dbt
- Small UI/UX improvements

### Fixed
- Fixed error message when dbt cloud IDE is not open
- Fixed postgres adapter reliability by using a pool connection
- Fixed error when fetching null dates from Bigquery

## [0.9.0] - 2021-10-26
### Added
- Added dashboards - users can now create, edit and delete dashboards

### Changed
- Navigation bar was rearranged. Saved charts and dashboards can be accessed under the "Browse" menu item
- When warehouse credentials are provided, we will run sql queries by connecting directly with warehouse instead via rpc server

### Fixed
- Fixed a bug where references in table calculations were not wrapped in quotes
- Fixed a bug where pressing "enter" in the login form would not submit form

### Removed
- Lightdash projects that connect to a remote dbt rpc server are no longer supported

## [0.8.3] - 2021-10-11
### Added
- Add "does not include" in stringfilter
### Changed
- Sort data immediately when clicking on column header
### Fixed
- Fixed a bug where we had the local dbt option when connecting a project in Cloud and Heroku deployments
- Fixed the snowflake connection form
- show warning message for postgres or redshift users
- filter dimensions and metrics by active fields in table calculation
- exclude test files from build
- show name of the saved chart in the explorer

## [0.8.2] - 2021-10-06
### Added
- Add ability to filter fields of boolean type

### Changed
- Data will be sorted by default. Priority: date/time dimension -> first metric`` -> first dimension
- Table calculation names no longer support special characters

### Fixed
- Fixed a bug where chart config would reset after running a query
- Fixed a bug in the chart where we could only select 1 metric when we were grouping by dimension

## [0.8.1] - 2021-09-29
### Added
- Added an installation script

### Fixed
- Fixed a bug where creating projects in the UI would fail for local/github/gitlab projects
- We now redirect the user to the login page after cookie expires

## [0.8.0] - 2021-09-27
### Added
- Added a welcome page
- Your dbt connection settings can now be updated in the Lightdash UI

### Changed
- Onboarding flow asks for a project with a valid dbt & warehouse connection instead of relying on lightdash.yml and profiles.yml

### Fixed
- Fixed request that shows the sql query
- Fixed a bug where the chart wouldn't clear when leaving the explore page

## [0.7.1] - 2021-09-24
### Fixed
- Fixed a bug where the explore menu button wasn't redirecting
- Fix seed data for our demo page

## [0.7.0] - 2021-09-24
### Added
- Users can see the dbt connection details and edit the warehouse connection in the UI

### Changed
- Explores are compiled individually. If an error happens in a single explores, all other explores will still be available in the UI
- Explores will not compile if the type of a dimension cannot be determined (uses target warehouse schema). Previously they defaulted to string types.

### Fixed
- Fixed a bug in the query builder that affected all target databases not using double quotes.

## [0.6.6] - 2021-09-15
### Added
- Gitlab connector is now available. Connect your Lightdash project to a dbt project hosted on gitlab.

### Fixed
- Fixed a bug with missing quotes in order by clause (fixed errors with snowflake)
- Fixed bug with wrong quote strings for dbt's athena adapter
- Fixed bug where optional project configs set via env where not recognised
- Add local state to track and update query parameters changes without affecting the current query data
- Url Parameters are now updated only when the query is run

## [0.6.5] - 2021-09-03
### Added
- Users can reorder the result table columns
- Add dbt profile target option in lightdash project config
- Add table calculations to your results table. Table calculations allow you to combine columns together 
in your results. For example, adding together two metrics to make a third or compute a running total. Table calculations
are written using raw sql. 

### Fixed
- Fixed error drawer from opening on each query change
- Fixed issue where chart label would be partially cut off
- Fixed issue where saving a chart would run the query and expand the chart section

## [0.6.4] - 2021-08-23
### Added
- Users can create and revoke invite links
- Users can create new accounts using invite link
- Show list of users in the organization
- Allow deleting users in the organization

### Fixed
- Fixed boolean value formatter to show yes/no values correctly.
- Fixed chart dimensions formatting issues, should format date and boolean correctly now
- Fixed sort behaviour where removing a field would not remove it from the list of sort fields
- Fixed bug where tables, metrics, and dimensions were ordered randomly (now alphabetical)

## [0.6.3] - 2021-08-10
### Fixed
- Fixed bugs with filters when selecting multiple filters on the same column

## [0.6.2] - 2021-08-09
### Changed
- dbt errors now show in a permanent error inbox making it easier to search through long error messages

### Fixed
- Fix bug where errors messages would disappear quickly
- Fix bug where sidebar and errors would not update after a dbt refresh
- Fix bug where links in error messages were not clickable

## [0.6.1] - 2021-08-05
### Added
 - Projects can now connect to github. Pull your dbt project files straight from a public or private github repository.
 
### Fixed
 - Fix bug where models with missing schema.yml entries would stop Lightdash projects from compiling

## [0.6.0] - 2021-08-03
### Added
 - Allow user to save queries
 - Can specify database connection using a URI (including unix sockets or `postgresql://` schemes)

### Changed
 - Environment variables for database connections have changed names

### Fixed
 - Filter date value doesn't match the date value in the url

## [0.5.0] - 2021-07-29
### Added
 - Add login and register pages
 - Allow user to edit their profile, password and organization name
 - Save user sessions in DB instead of memory
 - Allow configuration for secure self-deploys

### Fixed
 - Fix bug where refresh would not detect file changes in local deployments
 - Fix bug where database errors would not show in the UI

## [0.4.0] - 2021-07-14
### Added
 - Add date filters
 - Integration with dbt cloud IDE. Lightdash can now connect to your development environment on https://cloud.getdbt.com
 - Add help button in footer

### Changed
 - Lightdash requires your dbt project to use dbt version 0.20.0 or higher

## [0.3.2] - 2021-07-07
### Added
 - Allow users to download the chart as JPEG, PNG, SVG, PDF

### Fixed
 - Fix bug where environment variables for lightdash.yml where ignored
 - Fix error where quote characters in generated sql strings were incorrectly determined for some unofficial dbt adapters

## [0.3.1] - 2021-07-05
### Fixed
- Fix bug where the dbt child process handler couldn't handle event with multiple logs

## [0.3.0] - 2021-07-05
### Added
 - Add options menu for each table/dimension/metric
 - Add dialog with the relative file path and code relevant for each table/dimension/metric
 - Add footer with Lightdash version
 - Add Lightdash about dialog
 - Warn user when there is a new version available
 - Add non-aggregate metric types and support metric references in sql

### Changed
 - Moved lightdash configuration to a `lightdash.yml`, replacing environment variables

### Fixed
 - UI bug where the search box in the sidebar was cutoff
 - UI bug input fields overlapping at filterblock if used more than one
 - UI Intraction sidebar menu hierarchy makes it hard to read
 - UI bug where small scroll flicker happens while configure charts
 - UI bug where the metric description was concatenating the dimension description instead of the dimension name
 - Show specific error when GCP credentials are missing instead of timeout

## [0.2.7] - 2021-06-28
### Added
 - lineage graph can now be toggled to show the entire lineage of a table or just it's direct dependencies
 - improve table tree to show join details
 - dimension and metrics are compiled on "dbt refresh" surfacing errors in the UI

### Fixed
 - bug where we could group the only dimension available making the chart inaccessible
 - only show scroll bar in sidebar when content is scrollable
 - Stick sidebar on top left 
 - The stuck problem with scrollbar that shows only limited content on overflow
 - Errors in `meta` tags (such as invalid references to other dimensions) no longer crash the server and errors are shown in the UI

## [0.2.6] - 2021-06-23
### Fixed
 - bug where long lists of table were not scrollable in the side bar
 - improved chart UI when there isn't enough data to create a chart

## [0.2.5] - 2021-06-18
### Added
 - table lineage visualisation showing the source and dependent tables for each table in the UI
 - documentation to deploy Lightdash to production (GCP Cloud Run)
 - added rudderstack analytics, which is off by default, allowing you to send analytics data to any rudderstack server of your choice

### Fixed
 - bug where rudderstack analytics was active by default for the documentation site

## [0.2.4] - 2021-06-15
### Added
 - plot multiple metrics
 - select which dimension to show on x-axis or group by

### Fixed
 - fixed problem where charts would change when preparing a new query

## [0.2.3]
### Fixed
 - bug in the UI where the refresh button was disabled

## [0.2.2]
### Changed
 - improved error messages in the UI when dbt fails
 - improved docs for dbt failures, most common are profile and project misconfigurations

### Fixed
 - error where the server would crash when dbt fails

## [0.2.1] - 2021-06-02
### Changed
 - increased timeouts while waiting for larger dbt projects to compile

## [0.2.0] - 2021-06-02
### Added
 - CSV export feature for table of results
 - app url is shareable and can be used to share your current work (active table, columns, sorts, filters, limit)
 - user is prompted to confirm before losing work (starting to explore a new table)
 - dbt refreshes happen in the background whenever possible
 - better messages when query results are empty or haven't been run

### Changed
 - all api routes have been prefixed with `/api/v1`
 - updated site metadata and favicon
 - currently active fields aren't removed on changing tables
 - currently active fields aren't removed on refreshing tables
 - renamed "Measures" to "Metrics" everywhere
 - navigating the sidebar won't discard your current table explore

### Removed
 - multisort not supported (using shift click on column titles)

### Fixed
 - fixed problem where error messages wouldn't appear
 - fixed problem where app would be stuck in loading state

## [0.1.3] - 2021-05-20
### Fixed
 - fix issue with postgres backends where fields were quoted with backticks

## [0.1.2] - 2021-05-19
### Fixed
 - fix issue where failed sql queries didn't show details in the UI
 - fix queries using models with 2 or more joined tables

## [0.1.1] - 2021-05-18
### Fixed
 - fix production docker container

## [0.1.0] - 2021-05-18
### Added
 - metric and dimension definitions in dbt
 - automatic dimension creation
 - sql generation
 - simple charts
 - multi-dimension sorts in table view
