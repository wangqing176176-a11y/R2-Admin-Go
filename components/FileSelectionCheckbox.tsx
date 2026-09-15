"use client";

import { useId } from "react";

type FileSelectionCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export default function FileSelectionCheckbox({ checked, indeterminate = false, label, onChange }: FileSelectionCheckboxProps) {
  const id = useId();

  return (
    <span
      className="checkbox-wrapper-46"
      title={label}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <input
        id={id}
        className="inp-cbx"
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        ref={(node) => { if (node) node.indeterminate = indeterminate; }}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label className="cbx" htmlFor={id}>
        <span aria-hidden="true">
          <svg width="12" height="10" viewBox="0 0 12 10">
            <polyline points="1.5 6 4.5 9 10.5 1" />
            <path className="checkbox-mixed" d="M2 5h8" />
          </svg>
        </span>
        <span className="sr-only">{label}</span>
      </label>
    </span>
  );
}
