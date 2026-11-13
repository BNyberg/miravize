declare const Deno: {
  serve(handler: (req: Request) => unknown): void
  env: {
    get(key: string): string | undefined
  }
}

declare module 'https://esm.sh/@supabase/supabase-js@2.49.1' {
  export function createClient(...args: any[]): any
}
