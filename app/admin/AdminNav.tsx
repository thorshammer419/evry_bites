"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/admin/pos", label: "Point of Sale" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/users", label: "Customers" },
  { href: "/admin/sales", label: "Sales" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b-4 border-blue-900 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4">
        <nav className="flex items-center justify-center h-14 gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-900 text-white"
                    : "text-blue-700 hover:bg-sky-100 hover:text-blue-900"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
