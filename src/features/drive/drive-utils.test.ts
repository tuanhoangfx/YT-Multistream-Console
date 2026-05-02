import { describe, expect, it } from "vitest";
import {
  cleanupDriveLibrary,
  deriveMetadataStatus,
  driveFileKey,
  isValidDriveLibraryFileUrl,
  parseDriveLinks,
  uniqueDriveUrls,
  type DriveLibraryItem
} from "./drive-utils";

describe("drive utils", () => {
  it("extracts stable Drive file key", () => {
    const a = "https://drive.google.com/file/d/abc123/view?usp=drive_link";
    const b = "https://drive.google.com/uc?export=download&id=abc123";
    expect(driveFileKey(a)).toBe("abc123");
    expect(driveFileKey(b)).toBe("abc123");
  });

  it("validates library file urls and rejects folders", () => {
    expect(isValidDriveLibraryFileUrl("https://drive.google.com/file/d/x1/view")).toBe(true);
    expect(isValidDriveLibraryFileUrl("https://drive.google.com/open?id=x2")).toBe(true);
    expect(isValidDriveLibraryFileUrl("https://drive.google.com/drive/folders/x3")).toBe(false);
    expect(isValidDriveLibraryFileUrl("https://example.com/file/d/x/view")).toBe(false);
  });

  it("deduplicates and keeps only valid file urls", () => {
    const urls = ["https://drive.google.com/file/d/a1/view", "https://example.com/a", "https://drive.google.com/uc?id=a1", "https://drive.google.com/file/d/b/view"];
    expect(uniqueDriveUrls(urls)).toEqual([
      "https://drive.google.com/file/d/a1/view",
      "https://drive.google.com/file/d/b/view"
    ]);
  });

  it("parses links from mixed separators", () => {
    const value = "https://drive.google.com/file/d/a/view\nhttps://drive.google.com/file/d/b/view; https://drive.google.com/file/d/a/view";
    expect(parseDriveLinks(value)).toEqual([
      "https://drive.google.com/file/d/a/view",
      "https://drive.google.com/file/d/b/view"
    ]);
  });

  it("parse drops folder links", () => {
    expect(parseDriveLinks("https://drive.google.com/drive/folders/abc\nhttps://drive.google.com/file/d/z/view")).toEqual([
      "https://drive.google.com/file/d/z/view"
    ]);
  });

  it("cleanup removes invalid and duplicate file keys", () => {
    const items: DriveLibraryItem[] = [
      {
        id: "1",
        url: "https://drive.google.com/file/d/same/view",
        name: "A",
        group: "g",
        duration: "-",
        resolution: "-",
        size: "-",
        addedAt: "1",
        metadataStatus: "pending"
      },
      {
        id: "2",
        url: "https://drive.google.com/open?id=same",
        name: "B",
        group: "g",
        duration: "-",
        resolution: "-",
        size: "-",
        addedAt: "2",
        metadataStatus: "pending"
      },
      {
        id: "3",
        url: "https://drive.google.com/drive/folders/bad",
        name: "C",
        group: "g",
        duration: "-",
        resolution: "-",
        size: "-",
        addedAt: "3",
        metadataStatus: "pending"
      }
    ];
    const cleaned = cleanupDriveLibrary(items);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].id).toBe("1");
  });

  it("derives metadata status correctly", () => {
    expect(deriveMetadataStatus({ metadataStatus: "pending", metadataChecked: false })).toBe("pending");
    expect(deriveMetadataStatus({ duration: "00:10:00", resolution: "1920x1080", metadataChecked: true })).toBe("ready");
    expect(deriveMetadataStatus({ name: "Video 1", metadataChecked: true })).toBe("partial");
    expect(deriveMetadataStatus({ metadataStatus: "error", metadataChecked: true })).toBe("pending");
  });
});
