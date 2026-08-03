declare namespace NodeJS {
  interface ProcessEnv {
    readonly DUCKDB_PATH: string;
    readonly NEXT_PUBLIC_SITE_URL: string;
  }
}
