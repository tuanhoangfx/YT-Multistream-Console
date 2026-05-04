import { driveFileKey, hasDriveValue, isValidDriveLibraryFileUrl, type DriveLibraryItem, type DriveMetadataStatus } from "./drive-utils";

export const DRIVE_LIBRARY_LIMIT = 5000;

export function appendDriveLinks(items: DriveLibraryItem[], urls: string[], groupDraft: string) {
  const existingUrls = new Set(items.map((item) => driveFileKey(item.url)));
  const group = groupDraft.trim() || "Ungrouped";
  const seenUrls = new Set(existingUrls);
  const nextItems = urls
    .map((url) => String(url || "").trim())
    .filter(isValidDriveLibraryFileUrl)
    .filter((url) => {
      const key = driveFileKey(url);
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    })
    .map((url) => ({
      id: crypto.randomUUID(),
      url,
      name: "Drive video",
      group,
      duration: "Auto",
      resolution: "Auto",
      size: "Auto",
      addedAt: new Date().toLocaleDateString("en-GB"),
      metadataStatus: "pending" as DriveMetadataStatus,
      metadataMessage: "Waiting for metadata scan.",
      metadataChecked: false
    }));
  return [...nextItems, ...items].slice(0, DRIVE_LIBRARY_LIMIT);
}

export function removeDriveLinkById(items: DriveLibraryItem[], id: string) {
  return items.filter((item) => item.id !== id);
}

export function removeSelectedDriveLinks(items: DriveLibraryItem[], selectedIds: Set<string>) {
  return items.filter((item) => !selectedIds.has(item.id));
}

export function applyGroupToDriveLinks(items: DriveLibraryItem[], selectedIds: Set<string>, group: string) {
  return items.map((item) => (selectedIds.has(item.id) ? { ...item, group } : item));
}

export function markDriveMetadataPending(item: DriveLibraryItem) {
  return {
    ...item,
    duration: hasDriveValue(item.duration) ? item.duration : "Auto",
    resolution: hasDriveValue(item.resolution) ? item.resolution : "Auto",
    size: hasDriveValue(item.size) ? item.size : "Auto",
    metadataStatus: "pending" as DriveMetadataStatus,
    metadataMessage: "Waiting for metadata scan.",
    metadataChecked: false
  };
}
