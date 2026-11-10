"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
      Print / save PDF
    </button>
  );
}
