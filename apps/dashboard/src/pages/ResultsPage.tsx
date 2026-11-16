import { Navigate, useLocation } from "react-router";

/** Keep old result links/bookmarks usable without a second lifecycle UI. */
export function ResultsPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const filter = params.get("filter")?.toLowerCase();
  params.set("filter", filter === "review" ? "REVIEW" : filter === "success" ? "SUCCESS" : "TERMINAL");
  // A linked mission is opened regardless of the legacy list filter.
  if (params.has("mission")) params.delete("filter");
  return <Navigate replace to={{ pathname: "/missions", search: "?" + params, hash: location.hash }} />;
}
