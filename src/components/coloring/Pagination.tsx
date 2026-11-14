import Link from "next/link";

type PaginationProps = {
  basePath: string;
  currentPage: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function Pagination({ basePath, currentPage, totalPages, hasPreviousPage, hasNextPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav className="pagination" aria-label="Gallery pagination">
      {hasPreviousPage ? (
        <Link className="button button-subtle" href={pageHref(basePath, previousPage)} prefetch={false}>
          Previous
        </Link>
      ) : (
        <span className="button button-disabled" aria-disabled="true">
          Previous
        </span>
      )}
      <span className="pagination-status">
        Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      <div className="pagination-pages">
        {[...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])].filter((page) => page > 0 && page <= totalPages).map((page, index, pages) => (
          <span className="pagination-page" key={page}>
            {index > 0 && page - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
            <Link href={pageHref(basePath, page)} prefetch={false} aria-label={`Page ${page}`} aria-current={page === currentPage ? "page" : undefined}>{page}</Link>
          </span>
        ))}
      </div>
      {hasNextPage ? (
        <Link className="button button-subtle" href={pageHref(basePath, nextPage)} prefetch={false}>
          Next
        </Link>
      ) : (
        <span className="button button-disabled" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}

function pageHref(basePath: string, page: number) {
  return page <= 1 ? basePath : `${basePath}/page/${page}`;
}
