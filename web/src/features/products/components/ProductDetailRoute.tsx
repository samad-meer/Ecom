"use client";

import { useParams, usePathname } from "next/navigation";
import { ProductDetail } from "./ProductDetail";

/**
 * Client wrapper for the statically-exported /products/[id] route.
 *
 * A product added after the last build has no exported folder, so the host
 * rewrites its URL to the /products/_/ shell (see web/public/.htaccess). That
 * shell was prerendered with id "_", and useParams() can hand back that
 * placeholder rather than the id the customer actually asked for. The address
 * bar is the one source that is right under both routes — a real exported page
 * and the rewritten shell — so the pathname wins and useParams is the fallback.
 */
export function ProductDetailRoute() {
  const params = useParams();
  const pathname = usePathname();

  const fromPath = pathname?.match(/\/products\/([^/]+)\/?$/)?.[1];
  const fromParams = Array.isArray(params.id) ? params.id[0] : params.id;

  const id = fromPath && fromPath !== "_" ? fromPath : (fromParams ?? "");
  return <ProductDetail id={String(id)} />;
}
