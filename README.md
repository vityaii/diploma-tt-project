# diploma-tt-project

## Run With Docker Compose

The full application stack can be started with one command:

```bash
docker compose up --build
```

Default services started by `docker compose up`:

- `db`: PostgreSQL on `localhost:5431`
- `backend`: API on `http://localhost:7070`
- `frontend`: Vite dev server on `http://localhost:5173`

Notes:

- The frontend runs inside Docker, so `npm run dev` is no longer required on the host.
- Frontend requests are proxied from Vite to the backend container via Docker network.
- Source files from `frontend-tt/task-tracker-frontend` are mounted into the container, so frontend changes are reflected without rebuilding the image.

Optional infrastructure:

- `jenkins` is now behind the `infra` profile and is not started by default.
- To start it too:

```bash
docker compose --profile infra up --build
```
