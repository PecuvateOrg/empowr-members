"use client";

// The open/close behaviour behind a collapsed menu: Escape, outside click,
// close on navigation, and close when the viewport grows past the width at
// which the menu stops existing.
//
// EXTRACTED FROM CollapsibleNav, whose own comment gives the reason — this
// behaviour has to exist once rather than being copied per header and
// drifting apart. There are now two callers with quite different markup
// (a panel dropping DOWN from the header, and one rising UP out of the
// mobile bottom bar), and the thing they must share is the behaviour, not
// the styling. Splitting it this way keeps the door tablet's admin nav and
// the member bottom bar on identical semantics.
//
// EVERY BRANCH HERE IS A BUG THAT HAPPENED. The breakpoint close exists
// because a viewport growing past the breakpoint swapped the trigger for the
// full row while `open` stayed true: shrinking back re-opened a panel nobody
// asked for, and the trigger underneath read aria-expanded="true" the whole
// time it was invisible.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export type MenuDisclosure = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
};

export function useMenuDisclosure({
  closeAbove,
}: {
  /** The media query above which this menu does not exist, so an open panel
   *  must not survive into it. Pass the SAME width the markup collapses at. */
  closeAbove: string;
}): MenuDisclosure {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation, or the panel stays open over the page you just
  // moved to.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(closeAbove);
    if (query.matches) setOpen(false);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, closeAbove]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return {
    open,
    setOpen,
    toggle: () => setOpen((value) => !value),
    panelRef,
    buttonRef,
  };
}
