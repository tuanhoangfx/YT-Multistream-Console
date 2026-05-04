import { describe, expect, it } from "vitest";
import { appendDriveLinks, DRIVE_LIBRARY_LIMIT } from "./actions";
import type { DriveLibraryItem } from "./drive-utils";

function makeDriveUrl(index: number) {
  return `https://drive.google.com/file/d/file-${index}/view?usp=drive_link`;
}

describe("drive actions", () => {
  it("keeps pasted Drive batches well above the old 200 item cap", () => {
    const urls = Array.from({ length: 2000 }, (_value, index) => makeDriveUrl(index));

    const library = appendDriveLinks([], urls, "Bulk");

    expect(library).toHaveLength(2000);
    expect(library[0]).toMatchObject({
      url: makeDriveUrl(0),
      group: "Bulk",
      metadataStatus: "pending"
    });
  });

  it("still caps the library at the configured high-water limit", () => {
    const existing: DriveLibraryItem[] = Array.from({ length: DRIVE_LIBRARY_LIMIT }, (_value, index) => ({
      id: `existing-${index}`,
      url: makeDriveUrl(index),
      name: "Drive video",
      group: "Existing",
      duration: "-",
      resolution: "-",
      size: "-",
      addedAt: "01/01/2026",
      metadataStatus: "pending"
    }));

    const library = appendDriveLinks(existing, [makeDriveUrl(DRIVE_LIBRARY_LIMIT + 1)], "Bulk");

    expect(library).toHaveLength(DRIVE_LIBRARY_LIMIT);
    expect(library[0].url).toBe(makeDriveUrl(DRIVE_LIBRARY_LIMIT + 1));
  });
});
