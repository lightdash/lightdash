# Changelog

Recent and upcoming changes to lightdash

## [Unreleased]
### Added
 - CSV export feature for table of results
 - app url is shareable and be used to share the current table and active fields you've selected

### Changed
 - updated site metadata and favicon
 - currently active fields aren't removed on changing tables
 - currently active fields aren't removed on refreshing tables

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
