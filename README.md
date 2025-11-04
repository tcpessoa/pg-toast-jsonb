# Impact of big JSONB fields with regular updates

# Running the scenarios

## Prerequisites
- `docker` and `docker-compose` installed
- `bun` > 1.3.0 installed

## Steps
1. Clone the repository
2. Run the following command to start the database:

```bash
docker-compose up -d
```
3. Run the following command to install the dependencies:

```bash
bun install
```
4. Run the following command to run the analysis:

```bash
bun start
```

It can take up to 5mins. Check what a run looks like at [logs](./example-log-run.txt)

Supports article: https://blog-tcpessoa.vercel.app/blog/postgres-toast-jsonb
