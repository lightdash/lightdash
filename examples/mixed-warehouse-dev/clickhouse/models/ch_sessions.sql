{{ config(materialized='view', schema='analytics', alias='ch_sessions') }}
select session_id, user_id, platform, session_date, duration_minutes from analytics.ch_sessions
