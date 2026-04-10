import { MapPin } from "lucide-react";

export function LocationTagList({
  locations,
  className,
}: {
  locations?: string[] | null;
  className?: string;
}) {
  if (!locations || locations.length === 0) return null;
  return (
    <div className={className ?? "mt-3 flex flex-wrap gap-2"}>
      {locations.map((loc) => (
        <span
          key={loc}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
        >
          <MapPin className="h-3 w-3" />
          {loc}
        </span>
      ))}
    </div>
  );
}
