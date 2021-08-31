# Changelog

Recent and upcoming changes to lightdash

## Unreleased
### Added
- Users can reorder the result table columns
- Add dbt profile target option in lightdash project config
- Add table calculations to your results table. Table calculations allow you to combine columns together 
in your results. For example, adding together two metrics to make a third or compute a running total. Table calculations
are written using raw sql. 

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
