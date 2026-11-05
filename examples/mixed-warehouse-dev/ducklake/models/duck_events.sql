{{ config(materialized='view', database='ducklake', schema='main', alias='duck_events') }}
select event_id, user_id, event_type, event_date, amount from ducklake.main.duck_events
