"""ASGI entrypoint (`main:app`, as in ADR-004 phase 6). Configuration comes from the environment."""

from api import create_app

app = create_app()
