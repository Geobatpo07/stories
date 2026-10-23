"""A minimal in-memory stand-in for Supabase's PostgREST `persistence_records` table, used ONLY for
the manual Phase 4 frontend run (no real Supabase project exists). Run:
    uvicorn fake_postgrest:app --port 54321
It implements exactly what runtime/adapters/supabase-persistence-adapter.ts and
backend/runtime/supabase.py send: upsert POST, filtered GET (namespace/collection/id eq., select,
order=id.asc) and filtered DELETE."""

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

app = FastAPI()
rows: dict[tuple[str, str, str], dict] = {}
log: list[str] = []


def _eq(request: Request, name: str) -> str | None:
    value = request.query_params.get(name)
    return value[3:] if value and value.startswith("eq.") else None


def _match(request: Request):
    ns, col, id_ = _eq(request, "namespace"), _eq(request, "collection"), _eq(request, "id")
    return [
        r
        for r in rows.values()
        if r["namespace"] == ns and r["collection"] == col and (id_ is None or r["id"] == id_)
    ]


@app.post("/rest/v1/persistence_records")
async def upsert(request: Request) -> Response:
    body = await request.json()
    rows[(body["namespace"], body["collection"], body["id"])] = body
    log.append(f"POST {body['namespace']}/{body['collection']}")
    return Response(status_code=201)


@app.get("/rest/v1/persistence_records")
async def read(request: Request) -> JSONResponse:
    found = sorted(_match(request), key=lambda r: r["id"])
    log.append(f"GET {request.url.query[:60]}")
    return JSONResponse([{"value": r["value"]} for r in found])


@app.delete("/rest/v1/persistence_records")
async def delete(request: Request) -> Response:
    for r in _match(request):
        rows.pop((r["namespace"], r["collection"], r["id"]), None)
    return Response(status_code=204)


@app.get("/_log")
async def get_log() -> list[str]:
    return log
