import type { StreamJob } from "../../types";
import type { DriveLibraryItem } from "../drive/drive-utils";

export function filterQueueRows(jobs: StreamJob[], queueSearch: string, queueStatusFilter: string[], queueSourceFilter: string[]) {
  const term = queueSearch.trim().toLowerCase();
  return jobs.filter((job) => {
    const matchesTerm = !term || job.channelName.toLowerCase().includes(term) || job.lastMessage.toLowerCase().includes(term);
    const matchesStatus = queueStatusFilter.length === 0 || queueStatusFilter.includes(job.status);
    const matchesSource = queueSourceFilter.length === 0 || queueSourceFilter.includes(job.sourceType);
    return matchesTerm && matchesStatus && matchesSource;
  });
}

export function filterLibraryRows(
  driveLibrary: DriveLibraryItem[],
  librarySearch: string,
  libraryStatusSelection: string[],
  libraryResolutionSelection: string[],
  libraryGroupSelection: string[] = []
) {
  const term = librarySearch.trim().toLowerCase();
  return driveLibrary.filter((item) => {
    const matchesTerm =
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.url.toLowerCase().includes(term) ||
      item.group.toLowerCase().includes(term) ||
      item.duration.toLowerCase().includes(term) ||
      item.resolution.toLowerCase().includes(term) ||
      item.size.toLowerCase().includes(term) ||
      item.metadataStatus.toLowerCase().includes(term) ||
      item.addedAt.toLowerCase().includes(term);
    const matchesStatus = libraryStatusSelection.length === 0 || libraryStatusSelection.includes(item.metadataStatus);
    const matchesResolution = libraryResolutionSelection.length === 0 || libraryResolutionSelection.includes(item.resolution);
    const matchesGroup = libraryGroupSelection.length === 0 || libraryGroupSelection.includes(item.group || "Ungrouped");
    return matchesTerm && matchesStatus && matchesResolution && matchesGroup;
  });
}

export function filterConfigDriveRows(
  driveLibrary: DriveLibraryItem[],
  configDriveSearch: string,
  configDriveStatusSelection: string[],
  configDriveResolutionSelection: string[],
  configDriveGroupSelection: string[] = []
) {
  const term = configDriveSearch.trim().toLowerCase();
  return driveLibrary.filter((item) => {
    const matchesTerm =
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.group.toLowerCase().includes(term) ||
      item.url.toLowerCase().includes(term) ||
      item.duration.toLowerCase().includes(term) ||
      item.resolution.toLowerCase().includes(term) ||
      item.size.toLowerCase().includes(term) ||
      item.metadataStatus.toLowerCase().includes(term);
    const matchesStatus = configDriveStatusSelection.length === 0 || configDriveStatusSelection.includes(item.metadataStatus);
    const matchesResolution = configDriveResolutionSelection.length === 0 || configDriveResolutionSelection.includes(item.resolution);
    const matchesGroup = configDriveGroupSelection.length === 0 || configDriveGroupSelection.includes(item.group || "Ungrouped");
    return matchesTerm && matchesStatus && matchesResolution && matchesGroup;
  });
}
