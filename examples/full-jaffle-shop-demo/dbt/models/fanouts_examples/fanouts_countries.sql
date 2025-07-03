select
    iso_code,
    country_name
from 
    {{ ref('countries_raw') }}