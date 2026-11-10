select d::date as calendar_date, extract(isodow from d)::int as day_of_week
from generate_series(date '2024-01-01', date '2024-12-31', interval '1 day') d
