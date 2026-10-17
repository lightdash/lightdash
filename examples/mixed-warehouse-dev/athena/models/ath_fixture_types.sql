{{ config(materialized='view', database='awsdatacatalog', schema='athena_spike', alias='xp_fixture_types') }}
select id, label, amount, day from athena_spike.xp_fixture_types
