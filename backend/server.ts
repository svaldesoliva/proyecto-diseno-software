import { application } from "./app.ts";
import { refreshCatalog } from "./refresh.ts";

Deno.serve((req, { remoteAddr }) => application(req, remoteAddr.hostname));
async function refresh() {
  try {
    console.log(await refreshCatalog());
  } catch (error) {
    console.error(
      "Catalog refresh failed",
      error instanceof Error ? error.name : "Unknown error",
    );
  } finally {
    Deno.unrefTimer(setTimeout(refresh, 30 * 60_000));
  }
}
await refresh();
