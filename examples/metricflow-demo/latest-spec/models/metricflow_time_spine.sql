{{ config(materialized='table') }}

with days as (
    {{ dbt.date_spine('day', "'2024-01-01'::date", "'2026-01-01'::date") }}
)

select cast(date_day as date) as date_day
from days
