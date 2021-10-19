# Lightdash approach to BI

The vision for Lightdash is:

> To enable everybody in your company to answer their own questions using data.

Lightdash is where data analysts (the builders) and the rest of the business (the consumers)
come together to make better data-driven decisions.

There are three approaches to enabling data consumers to answer their own questions:

1. Data consumers use SQL to analyse the raw data themselves.
2. Data analysts use SQL to analyse raw data on behalf of data consumers.

**The Lightdash way**
3. Data analysts use SQL to create metrics. Data consumers use metrics to analyse data themselves.

## 1. Data consumers use SQL

If everybody knows in your organization knows SQL and are willing to spend time analysing data, then everybody can 
answer their own questions by running queries over the raw data.

The major disadvantage here is that if a single person doesn't know SQL then they're not able to serve themselves.

* **Pros**: flexibility, anyone can query any data

* **Cons**: everybody has to know sql, everybody needs context of raw data

## 2. Data analysts use SQL

If nobody knows SQL or they aren't willing to explore data themselves, then dedicated team members (data analysts) 
will be completely responsible for exploring data. Everybody relies on the data team for answer questions.

* **Pros**: only analysts have to know sql
* **Cons**: doesn't scale as analysts become a bottleneck

## 3. Writing dimensions and metrics

The Lightdash way: allow anyone in the business to explore a limited selection of metrics using a simplified 
interface. With this approach, only the data team needs to understand SQL, which they use to curate pre-defined 
metrics. Anybody in the business is free to take these metrics and combine, segment, and filter them to answer their 
own questions.

The downside is that the data team need to spend some time defining and maintaining the library of metrics. However, 
a small set of metrics can power a huge amount of different analyses, making this effort an efficient use of time 
compared to above (*2. Data analysts use SQL*).

* **Pros**: only analysts have to know sql, anyone can query data
* **Cons**: analysts create and maintain a library of metrics
