import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScannerFilters } from "@/components/scanner/scanner-filters";
import {
  DEFAULT_QUERY,
  DEFAULT_SORT,
  type ScannerQuery,
  type ScannerSort,
} from "@/lib/scanner-query";

function Harness() {
  const [query, setQuery] = useState<ScannerQuery>(DEFAULT_QUERY);
  const [sort, setSort] = useState<ScannerSort>(DEFAULT_SORT);

  return (
    <ScannerFilters
      query={query}
      sort={sort}
      resultCount={13}
      onQueryChange={setQuery}
      onSortChange={setSort}
      onClear={() => {
        setQuery(DEFAULT_QUERY);
        setSort(DEFAULT_SORT);
      }}
    />
  );
}

describe("mobile scanner filters", () => {
  it("opens and closes the advanced filter panel", () => {
    render(<Harness />);

    const button = screen.getByRole("button", { name: "Filters" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Direction")).toBeInTheDocument();
    expect(screen.getByLabelText("Freshness")).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Direction")).not.toBeInTheDocument();
  });

  it("applies an advanced mobile filter and exposes the active count", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "LONG" },
    });

    expect(
      screen.getByRole("button", { name: "Filters (1 active)" })
    ).toBeInTheDocument();
  });
});
