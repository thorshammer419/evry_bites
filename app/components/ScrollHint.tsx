"use client";

import { useState, useEffect } from "react";

export function ScrollHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const scrollable = document.body.scrollHeight > window.innerHeight + 80;
      const nearBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 80;
      setShow(scrollable && !nearBottom);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed right-3 top-1/2 -translate-y-1/2 z-20 md:hidden flex flex-col items-center gap-0.5 pointer-events-none select-none">
      {[0, 150, 300].map((delay) => (
        <svg
          key={delay}
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-purple-600 animate-bounce opacity-60"
          style={{ animationDelay: `${delay}ms` }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      ))}
    </div>
  );
}
