import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type SliderVariant = "default" | "rose" | "teal" | "violet" | "amber";

const rangeColor: Record<SliderVariant, string> = {
  default: "bg-emerald-500",
  rose:    "bg-[#EF4444]",
  teal:    "bg-[#14B8A6]",
  violet:  "bg-[#A78BFA]",
  amber:   "bg-[#F59E0B]",
};

const thumbColor: Record<SliderVariant, string> = {
  default: "border-emerald-400  bg-zinc-900  focus-visible:ring-emerald-400",
  rose:    "border-[#EF4444]    bg-[#1A0A0A] focus-visible:ring-[#EF4444]",
  teal:    "border-[#14B8A6]    bg-[#060D0C] focus-visible:ring-[#14B8A6]",
  violet:  "border-[#A78BFA]    bg-[#0D0A18] focus-visible:ring-[#A78BFA]",
  amber:   "border-[#F59E0B]    bg-[#120A00] focus-visible:ring-[#F59E0B]",
};

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  variant?: SliderVariant;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, variant = "default", ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-[var(--surface-high,#1A2133)]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px opacity-30"
        style={{ background: "var(--border-bright, #2A3A52)", transform: "translateX(-50%)" }}
      />
      <SliderPrimitive.Range className={cn("absolute h-full transition-all", rangeColor[variant])} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-4 w-4 rounded-sm border-2 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ink,#0B0E14)]",
        "disabled:pointer-events-none disabled:opacity-50",
        "hover:scale-110",
        thumbColor[variant],
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
export type { SliderVariant };
