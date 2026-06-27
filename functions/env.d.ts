/// <reference types="@cloudflare/workers-types" />

interface Env {
  UPLOADS: R2Bucket;
}

type PagesFunction<E = Env> = (context: {
  request: Request;
  env: E;
  params: Record<string, string | string[] | undefined>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: () => Promise<Response>;
  data: Record<string, unknown>;
}) => Response | Promise<Response>;
