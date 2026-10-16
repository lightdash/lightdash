{{ config(materialized='view', database='AGENT_DEMO', schema='PUBLIC', alias='CUSTOMERS') }}
select customer_id, segment, balance from AGENT_DEMO.PUBLIC.CUSTOMERS
