import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  const classes = ["breadcrumb", className].filter(Boolean).join(" ");

  return (
    <nav className={classes} aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return (
          <span className="breadcrumb-item" key={`${item.label}-${index}`}>
            {index > 0 ? <span className="breadcrumb-separator" aria-hidden="true">/</span> : null}
            {isCurrent || !item.href ? (
              <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
            ) : (
              <Link href={item.href} prefetch={false}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
