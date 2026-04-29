import { describe, expect, it } from "vitest";
import { deriveMetadataStatus, driveFileKey, parseDriveLinks, uniqueDriveUrls } from "./drive-utils";

describe("drive utils", () => {
  it("extracts stable Drive file key", () => {
    const a = "https://drive.google.com/file/d/abc123/view?usp=drive_link";
    const b = "https://drive.google.com/uc?export=download&id=abc123";
    expect(driveFileKey(a)).toBe("abc123");
    expect(driveFileKey(b)).toBe("abc123");
  });

  it("deduplicates and keeps only drive urls", () => {
    const urls = ["https://drive.google.com/file/d/a1/view", "https://example.com/a", "https://drive.google.com/uc?id=a1"];
    expect(uniqueDriveUrls(urls)).toHaveLength(1);
  });

  it("parses links from mixed separators", () => {
    const value = "https://drive.google.com/file/d/a/view\nhttps://drive.google.com/file/d/b/view; https://drive.google.com/file/d/a/view";
    expect(parseDriveLinks(value)).toEqual([
      "https://drive.google.com/file/d/a/view",
      "https://drive.google.com/file/d/b/view"
    ]);
  });

  it("derives metadata status correctly", () => {
    expect(deriveMetadataStatus({ metadataStatus: "pending", metadataChecked: false })).toBe("pending");
    expect(deriveMetadataStatus({ duration: "00:10:00", resolution: "1920x1080", metadataChecked: true })).toBe("ready");
    expect(deriveMetadataStatus({ name: "Video 1", metadataChecked: true })).toBe("partial");
    expect(deriveMetadataStatus({ metadataStatus: "error", metadataChecked: true })).toBe("pending");
  });
});
