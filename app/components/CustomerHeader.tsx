"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser, UserButton, SignInButton } from "@clerk/nextjs";

interface CustomerHeaderProps {
  title?: string;
  subtitle?: string;
  backHref?: string;
  showLogo?: boolean;
}

export function CustomerHeader({
  backHref,
  showLogo = true,
}: CustomerHeaderProps) {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <header className="bg-white border-b-4 border-blue-900 sticky top-0 z-10 overflow-visible">
      <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="shrink-0" aria-label="Go back">
            <Image src="/back-button.png" alt="Back" width={80} height={44} className="h-9 w-auto" />
          </Link>
        )}
        {showLogo && (
          <div className="relative shrink-0 self-start mt-[10px]">
            <Link href="/story" aria-label="Our story">
              <Image
                src="/logo.png"
                alt="Ev'ry Bites Bakery"
                width={88} height={88}
                className="[filter:drop-shadow(6px_8px_10px_rgba(0,0,0,0.55))]"
              />
            </Link>
            <Link href="/story" className="absolute top-[10px] left-[59px] z-10" aria-label="Click for our story">
              <Image
                src="/click_for_my_story.png"
                alt="Click for our story"
                width={76} height={28}
                className="h-7 w-auto"
              />
            </Link>
          </div>
        )}
        {showLogo ? (
          <div className="flex-1 flex justify-center items-center">
            <Image
              src="/fresh_baked_banner.png"
              alt="Fresh baked to order"
              width={152} height={58}
              className="h-[58px] w-auto"
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {isLoaded && (
          <div className="flex items-center gap-2 shrink-0">
            {isSignedIn ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button className="text-sm text-blue-700 hover:text-purple-800 font-medium px-3 py-1.5 rounded-lg border border-sky-200 hover:bg-sky-50 transition-colors">
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
