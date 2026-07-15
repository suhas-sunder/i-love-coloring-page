"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useModalDialog } from "@/hooks/useModalDialog";
import { resolveColoringAssetUrl } from "@/lib/coloring/assets";
import { browseAllColoringPagesLink, categoryNavigationGroups } from "@/lib/navigation/siteNav";
import {
  loadNavigationSearchData,
  type NavigationSearchData,
} from "@/lib/search/navigationSearchData";
import { normalizeSearchText, rankSearchItems } from "@/lib/search/ranking";

type GlobalSearchDialogProps = {
  open: boolean;
  onRequestClose: () => void;
  onNavigate: () => void;
};

type SearchLoadState = "idle" | "loading" | "loaded" | "error";

export function GlobalSearchDialog({ open, onRequestClose, onNavigate }: GlobalSearchDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<NavigationSearchData | null>(null);
  const [loadState, setLoadState] = useState<SearchLoadState>("idle");
  const runIdRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchText(deferredQuery);
  const hasSearchIntent = normalizedQuery.length >= 2;

  useEffect(() => setMounted(true), []);
  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);
  useEffect(() => {
    if (open) return;
    runIdRef.current += 1;
    setQuery("");
    setLoadState(data ? "loaded" : "idle");
  }, [data, open]);

  useEffect(() => {
    if (!open || !hasSearchIntent || data || loadState !== "idle") return;
    const runId = ++runIdRef.current;
    setLoadState("loading");
    void loadNavigationSearchData()
      .then((loadedData) => {
        if (runIdRef.current !== runId || !open) return;
        setData(loadedData);
        setLoadState("loaded");
      })
      .catch(() => {
        if (runIdRef.current !== runId || !open) return;
        setLoadState("error");
      });
  }, [data, hasSearchIntent, loadState, open]);

  useModalDialog({ open, panelRef, initialFocusRef: inputRef, onEscape: onRequestClose });

  const collectionResults = useMemo(() => {
    if (!data || !hasSearchIntent) return [];
    return rankSearchItems(
      data.collections.map((record) => ({
        ...record,
        title: record.label,
        stableKey: record.hubId,
        normalizedText: record.searchText,
      })),
      normalizedQuery,
    ).slice(0, 6).map((result) => result.item);
  }, [data, hasSearchIntent, normalizedQuery]);

  const printableResults = useMemo(() => {
    if (!data || !hasSearchIntent) return [];
    return rankSearchItems(
      data.printables.map((record) => ({
        ...record,
        stableKey: record.stableId,
        searchTerms: record.searchText,
      })),
      normalizedQuery,
    ).slice(0, 8).map((result) => result.item);
  }, [data, hasSearchIntent, normalizedQuery]);

  const status = getStatus({
    hasSearchIntent,
    loadState,
    resultCount: collectionResults.length + printableResults.length,
  });

  if (!mounted || !open) return null;
  return createPortal(
    <div className="global-search-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onRequestClose()}>
      <section ref={panelRef} className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="global-search-heading">
          <div>
            <h2 id={titleId}>Search coloring pages</h2>
            <p>Find a collection or open a printable page.</p>
          </div>
        </div>

        <label className="global-search-field" htmlFor={inputId}>
          <span>Search coloring pages</span>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            placeholder="Try animals, mandalas, or Christmas"
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="global-search-status" aria-live="polite" role="status">{status}</div>

        {loadState === "error" && hasSearchIntent ? (
          <div className="global-search-error">
            <p>Search is temporarily unavailable. You can still browse the full gallery.</p>
            <button className="button button-subtle button-small" type="button" onClick={() => setLoadState("idle")}>Try again</button>
          </div>
        ) : null}

        {!hasSearchIntent ? (
          <nav className="global-search-shortcuts" aria-label="Popular coloring page collections">
            <span>Popular</span>
            <div>
              {categoryNavigationGroups[0].links.slice(0, 4).map((link) => (
                <Link href={link.href} key={link.href} onClick={onNavigate} prefetch={false}>{link.label}</Link>
              ))}
            </div>
          </nav>
        ) : null}

        {collectionResults.length > 0 ? (
          <section className="global-search-section" aria-labelledby={`${titleId}-collections`}>
            <h3 id={`${titleId}-collections`}>Collection matches</h3>
            <ul className="global-search-collection-results">
              {collectionResults.map((result) => (
                <li key={result.hubId}>
                  <Link href={result.path} onClick={onNavigate} prefetch={false}>
                    <span>{result.label}</span>
                    <strong>{result.assetCount.toLocaleString()} printables</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {printableResults.length > 0 ? (
          <section className="global-search-section" aria-labelledby={`${titleId}-printables`}>
            <h3 id={`${titleId}-printables`}>Printable matches</h3>
            <ul className="global-search-printable-results">
              {printableResults.map((result) => (
                <li key={result.stableId}>
                  <Link href={result.path} onClick={onNavigate} prefetch={false}>
                    <SearchResultPreview title={result.title} webpPath={result.webpPath} />
                    <span className="global-search-result-copy">
                      <strong>{result.title}</strong>
                      <span>{result.primaryLabel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="global-search-footer">
          <Link className="button button-subtle" href={browseAllColoringPagesLink.href} onClick={onNavigate} prefetch={false}>
            {browseAllColoringPagesLink.label}
          </Link>
          <button className="button button-ghost" type="button" onClick={onRequestClose}>Close</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SearchResultPreview({ title, webpPath }: { title: string; webpPath: string }) {
  const [failed, setFailed] = useState(false);
  const src = resolveColoringAssetUrl(webpPath);
  if (!src || failed) return <span className="global-search-result-preview global-search-result-placeholder" aria-hidden="true" />;
  return <img className="global-search-result-preview" src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function getStatus({ hasSearchIntent, loadState, resultCount }: { hasSearchIntent: boolean; loadState: SearchLoadState; resultCount: number }) {
  if (!hasSearchIntent) return "Type at least two characters to search.";
  if (loadState === "loading" || loadState === "idle") return "Searching coloring pages…";
  if (loadState === "error") return "Search could not be completed.";
  if (resultCount === 0) return "No matching coloring pages. Try another search.";
  return `${resultCount.toLocaleString()} result${resultCount === 1 ? "" : "s"} shown.`;
}
