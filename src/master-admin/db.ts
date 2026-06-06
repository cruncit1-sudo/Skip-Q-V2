import { supabase } from "@/integrations/supabase/client";

// The generated `types.ts` file may not yet include the new master-admin
// tables. Use this loosely-typed handle for those tables only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;