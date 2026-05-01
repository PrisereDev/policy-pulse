import { cn } from "@/lib/utils";

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3",
        className
      )}
    >
      {children}
    </p>
  );
}
