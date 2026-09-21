import DashRing from "@/components/loading-ui/DashRing";

type LoadingStateProps = {
  label?: string;
  variant?: "dialog" | "preview" | "compact";
  className?: string;
};

const variantClasses = {
  dialog: {
    root: "min-h-64 gap-3 sm:min-h-72 sm:gap-3.5",
    ring: "h-8 w-8 sm:h-9 sm:w-9 [&_circle]:stroke-[1.8]",
    label: "text-xs sm:text-sm",
  },
  preview: {
    root: "h-full min-h-56 gap-3.5 sm:gap-4",
    ring: "h-10 w-10 sm:h-12 sm:w-12 [&_circle]:stroke-[1.65]",
    label: "text-[13px] sm:text-sm",
  },
  compact: {
    root: "gap-2.5",
    ring: "h-5 w-5 sm:h-6 sm:w-6 [&_circle]:stroke-[2]",
    label: "text-xs sm:text-[13px]",
  },
} as const;

export default function LoadingState({
  label,
  variant = "dialog",
  className = "",
}: LoadingStateProps) {
  const styles = variantClasses[variant];

  return (
    <div
      className={[
        "flex min-w-0 flex-col items-center justify-center text-center",
        styles.root,
        className,
      ].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
      aria-label={label || "正在加载"}
    >
      <DashRing
        role="presentation"
        aria-hidden="true"
        className={`shrink-0 text-blue-600 dark:text-blue-400 ${styles.ring}`}
      />
      {label ? (
        <span className={`font-medium leading-5 text-slate-600 dark:text-slate-300 ${styles.label}`}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
