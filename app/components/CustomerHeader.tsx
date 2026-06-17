"use client";

import Link from "next/link";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";

interface CustomerHeaderProps {
  title?: string;
  subtitle?: string;
  backHref?: string;
}

export function CustomerHeader({
  title = "EvryBites",
  subtitle = "Fresh baked to order",
  backHref,
}: CustomerHeaderProps) {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="text-amber-600 hover:text-amber-800 mr-1 text-lg leading-none"
          >
            ←
          </Link>
        )}
        <span className="text-3xl">🧁</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-amber-900 leading-none truncate">
            {title}
          </h1>
          <p className="text-xs text-amber-600">{subtitle}</p>
        </div>
        {isLoaded && (
          <div className="flex items-center gap-2 shrink-0">
            {isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button className="text-sm text-amber-700 hover:text-amber-900 font-medium px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
