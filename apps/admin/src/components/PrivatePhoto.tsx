"use client";
// A private image (partner documents), loaded with the staff token as an object URL.
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

export function PrivatePhoto({ load, alt, version = "" }: { load: () => Promise<string>; alt: string; version?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    setUrl(null); setFailed("");
    load().then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); }, (e) => live && setFailed(e instanceof Error ? e.message : "Couldn't load"));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
    // `load` is a new function each render; `alt` + `version` identify the photo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alt, version]);
  if (failed) return <p className="text-xs text-muted flex items-center gap-1.5"><ImageOff size={14} />{failed}</p>;
  if (!url) return <div className="skeleton h-40 w-full max-w-xs" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} className="max-h-56 rounded-lg border border-line object-contain bg-fg/5" /></a>;
}
