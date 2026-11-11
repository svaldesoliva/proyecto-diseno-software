import { application } from "../backend/app.ts";

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    // Vercel appends rewrite captures to the query; they are not catalog filters.
    url.searchParams.delete("__route");
    return application(new Request(url, request), request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown");
  },
};
