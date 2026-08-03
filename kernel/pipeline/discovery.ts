import type { Parser } from "../parsers/parser";
import type { EntityRegistration } from "../registry/types";

/** Discovery stage: list every source file for one registration. Pure listing, no parsing. */
export function discoverSourceFiles(
  registration: EntityRegistration,
  parser: Parser,
): readonly string[] {
  return parser.discover(registration.contentDir);
}
