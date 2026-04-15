import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
  showText?: boolean;
  /** Business name beside the mark; from policy analysis or profile when set */
  businessLabel?: string;
  /** Muted styling when showing the default placeholder (no name yet) */
  businessLabelIsPlaceholder?: boolean;
}

export function Logo({ 
  className, 
  width = 120, 
  height = 40, 
  showText = false,
  businessLabel,
  businessLabelIsPlaceholder = false,
}: LogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Image
        src="/Prisere-logo-transparent.png"
        alt="Prisere - Deep rooted. Farsighted."
        width={width}
        height={height}
        className="object-contain shrink-0"
        style={{ width: 'auto', height: 'auto', maxWidth: `${width}px`, maxHeight: `${height}px` }}
        priority
      />
      {businessLabel !== undefined && businessLabel !== "" && (
        <div className="min-w-0 border-l border-gray-200 pl-3">
          <p
            className={cn(
              "truncate text-sm font-semibold leading-tight text-prisere-dark-gray max-w-[min(14rem,45vw)]",
              businessLabelIsPlaceholder && "font-medium text-gray-400"
            )}
            title={businessLabel}
          >
            {businessLabel}
          </p>
        </div>
      )}
      {showText && (
        <div className="flex flex-col">
          <span className="text-sm text-prisere-dark-gray font-body italic">
            Deep rooted. Farsighted.®
          </span>
        </div>
      )}
    </div>
  );
}