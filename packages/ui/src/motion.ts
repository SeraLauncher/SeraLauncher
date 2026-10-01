import type { Transition } from "motion/react";

/** Faster spring for the small controls, where a 300ms settle feels sluggish. */
export const snappy: Transition = { type: "spring", stiffness: 620, damping: 38, mass: 0.6 };

/** Cross-fades for anything that only changes opacity. */
export const fade: Transition = { duration: 0.16, ease: "easeOut" };

/** The rail grows from 68px to 200px between the icon rail and the settings header,
 *  so that change is what the page transition hangs off rather than a slide. */
export const rail: Transition = { type: "spring", stiffness: 340, damping: 34, mass: 0.8 };

/** A rail that changes width needs its contents to move with it, and the label has to
 *  arrive after the rail has opened rather than stretch while it does. */
export const railLabel: Transition = {
  opacity: { duration: 0.14, delay: 0.08, ease: "easeOut" },
  x: { type: "spring", stiffness: 500, damping: 34 },
};

/** Page content fades rather than travelling, since the rail carries the motion now. */
export const pageFade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
