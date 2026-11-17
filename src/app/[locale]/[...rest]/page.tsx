import { notFound } from "next/navigation";

/** Any unknown path under /pt or /en renders the translated not-found page. */
export default function CatchAll() {
  notFound();
}
