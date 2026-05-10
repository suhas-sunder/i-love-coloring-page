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
      <Link
        className={hasPreviousPage ? "button button-secondary" : "button button-secondary button-disabled"}
        href={hasPreviousPage ? pageHref(basePath, previousPage) : basePath}
        aria-disabled={!hasPreviousPage}
      >
        Previous
      </Link>
      <span>
        Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      <Link
        className={hasNextPage ? "button button-secondary" : "button button-secondary button-disabled"}
        href={hasNextPage ? pageHref(basePath, nextPage) : pageHref(basePath, totalPages)}
        aria-disabled={!hasNextPage}
      >
        Next
      </Link>
    </nav>
  );
}

function pageHref(basePath: string, page: number) {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}
