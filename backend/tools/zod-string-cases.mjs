// Generates fixtures/auth-contract/zod-string-checks.json: what the REAL zod 3.25 accepts for the
// string checks the Studio routes use (email, uuid, datetime, min length), so the Python
// validators (schemas/zod_strings.py) can be checked against it. From the repository root:
//   node backend/tools/zod-string-cases.mjs > fixtures/auth-contract/zod-string-checks.json
import { createRequire } from "node:module";

const { z } = createRequire(import.meta.url)("zod");

const emails = [
  "admin@stories.test",
  "a@b.co",
  "a@localhost",
  "not-an-email",
  "",
  "a@b",
  "a@b.c",
  "A@B.CO",
  ".a@b.co",
  "a.@b.co",
  "a..b@b.co",
  "a.b@b.co",
  "a+tag@b.co",
  "a_b@b.co",
  "a-b@b-c.co",
  "a@-b.co",
  "a@b-.co",
  "a b@b.co",
  "a@b .co",
  "a@b.co ",
  " a@b.co",
  "a@b.co\n",
  "é@b.co",
  "a@é.co",
  "a@b.c0",
  "a@b.company",
  "a@sub.domain.example.org",
  "a@b..co",
  "@b.co",
  "a@",
  "a@b@c.co",
  "'quoted'@b.co",
  "a!b@b.co",
  "a/b@b.co",
  "x".repeat(70) + "@b.co",
];
const datetimes = [
  "2026-08-15T12:00:00.000Z",
  "2026-08-15T12:00:00Z",
  "2026-08-15T12:00Z",
  "2026-08-15T12:00:00.1Z",
  "2026-08-15T12:00:00.1234567Z",
  "2026-08-15T12:00:00+00:00",
  "2026-08-15T12:00:00",
  "2026-08-15",
  "2026-08-15 12:00:00Z",
  "2026-08-15t12:00:00z",
  "2024-02-29T00:00:00Z",
  "2026-02-29T00:00:00Z",
  "2026-13-01T00:00:00Z",
  "2026-00-10T00:00:00Z",
  "2026-04-31T00:00:00Z",
  "2026-08-15T24:00:00Z",
  "2026-08-15T23:59:59Z",
  "2026-08-15T12:60:00Z",
  "2026-08-15T12:00:60Z",
  "2100-02-29T00:00:00Z",
  "2000-02-29T00:00:00Z",
  "",
  "yesterday",
  "2026-8-15T12:00:00Z",
  "2026-08-15T12:00:00.Z",
  "2026-08-15T12:00:00Z\n",
  "٢٠٢٦-08-15T12:00:00Z",
];
const uuids = [
  "11111111-1111-4111-8111-111111111111",
  "ABCDEFAB-1111-4111-8111-111111111111",
  "11111111-1111-1111-1111-111111111111",
  "00000000-0000-0000-0000-000000000000",
  "11111111-1111-4111-8111-11111111111",
  "11111111-1111-4111-8111-1111111111111",
  "11111111-1111-4111-8111-11111111111g",
  "11111111111141118111111111111111",
  "",
  "not-a-uuid",
  "11111111-1111-4111-8111-111111111111\n",
  " 11111111-1111-4111-8111-111111111111",
  "{11111111-1111-4111-8111-111111111111}",
  "urn:uuid:11111111-1111-4111-8111-111111111111",
];
const lengths = [
  "",
  "a",
  "1234567",
  "12345678",
  "\u{1F600}\u{1F600}\u{1F600}",
  "\u{1F600}".repeat(4),
  "\u{1F600}".repeat(3) + "a",
  "é".repeat(8),
  "é".repeat(4),
  "日本語日本語日本",
  "日本語日本語日",
];

const run = (schema, values) =>
  values.map((value) => ({ value, ok: schema.safeParse(value).success }));
process.stdout.write(
  `${JSON.stringify(
    {
      email: run(z.string().email(), emails),
      datetime: run(z.string().datetime(), datetimes),
      uuid: run(z.string().uuid(), uuids),
      min1: run(z.string().min(1), lengths),
      min8: run(z.string().min(8), lengths),
    },
    null,
    2,
  )}\n`,
);
