import type React from "react";

type DashRingProps = React.ComponentProps<"svg">;

/**
 * Loading UI's Dash Ring, adapted to the project's local component structure.
 * Both circles inherit currentColor so callers can theme the track and dash
 * with ordinary text color utilities.
 */
export default function DashRing({ className = "", ...props }: DashRingProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      className={["r2-dash-ring", className].filter(Boolean).join(" ")}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        opacity="0.1"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="42 150"
        strokeDashoffset="-16"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-dasharray"
          values="0 150;42 150;42 150"
          keyTimes="0;0.5;1"
          dur="1.5s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-dashoffset"
          values="0;-16;-59"
          keyTimes="0;0.5;1"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
