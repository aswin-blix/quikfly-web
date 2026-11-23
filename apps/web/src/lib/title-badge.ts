// "(2) QuikFly…" in the browser tab while there are unread notifications, so a page left open in a
// background tab shows that something arrived. Pages set their own titles on navigation, so the
// prefix is re-applied whenever <title> changes.
import { useEffect } from "react";

const PREFIX = /^\(\d+\+?\)\s/;
const label = (n: number) => (n > 9 ? "9+" : String(n));

export function useTitleBadge(count: number) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(PREFIX, "");
      const next = count > 0 ? `(${label(count)}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next.js and the SPA router replace the <title> on navigation: put the count back.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(PREFIX, "");
    };
  }, [count]);
}
