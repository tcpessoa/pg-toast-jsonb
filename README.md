# Impact of big JSONB fields with regular updates

Discuss the significant difference in update frequency between large and small JSONB operations, using the summary table and bar chart as visual aids.

Explain why this difference occurs (the overhead of updating larger JSONB documents).

Discuss how this difference in update frequency relates to the size growth over time, referencing the line chart.

Use the detailed data table to provide specific examples or highlight key points in the data.

# Running the analysis

## Prerequisites
- `docker` and `docker-compose` installed
- `node` and `npm` installed

## Steps
1. Clone the repository
2. Run the following command to start the database:

```bash
docker-compose up -d
```
3. Run the following command to install the dependencies:

```bash
npm install
```
4. Run the following command to run the analysis:

```bash
npm start
```

# Summary

After running the steps this will generate the results and embed them in the html file. You can then open the `jsonb_update_results.html` file in your browser to view the results.

A generated HTML is provided where the analysis was run for a minute.
