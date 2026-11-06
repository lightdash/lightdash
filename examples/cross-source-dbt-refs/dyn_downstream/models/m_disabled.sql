{{ config(enabled=false) }}
select * from {{ ref('nowhere', 'ghost') }}
