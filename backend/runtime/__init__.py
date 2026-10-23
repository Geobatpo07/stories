"""Python ports of the Platform Runtime pieces the Studio needs (ports, clock, Supabase, Resend).

Mirrors `runtime/` in the TypeScript app: the ports are pure interfaces, the adapters are thin
`httpx` wrappers (direct REST calls, no SDK, same deliberate choice as the TypeScript adapters).
"""
