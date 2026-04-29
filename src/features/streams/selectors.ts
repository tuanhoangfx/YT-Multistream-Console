import type { StreamJob } from "../../types";
import type { DriveLibraryItem } from "../drive/drive-utils";

export function filterQueueRows(jobs: StreamJob[], queueSearch: string, queueStatusFilter: string, queueSourceFilter: string) {
  const term = queueSearch.trim().toLowerCase();
  return jobs.filter((job) => {
    const matchesTerm = !term || job.channelName.toLowerCase().includes(term) || job.lastMessage.toLowerCase().includes(term);
    const matchesStatus = queueStatusFilter === "all" || job.status === queueStatusFilter;
    const matchesSource = queueSourceFilter === "all" || job.sourceType === queueSourceFilter;
    return matchesTerm && matchesStatus && matchesSource;
  });
}

export function filterLibraryRows(
  driveLibrary: DriveLibraryItem[],
  librarySearch: string,
  libraryGroupFilter: string,
  libraryResolutionFilter: string,
  libraryDurationFilter: string
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
    const matchesGroup = libraryGroupFilter === "all" || item.group === libraryGroupFilter;
    const matchesResolution = libraryResolutionFilter === "all" || item.resolution === libraryResolutionFilter;
    const matchesDuration =
      libraryDurationFilter === "all" ||
      (libraryDurationFilter === "short" && /^0{0,1}0:/.test(item.duration)) ||
      (libraryDurationFilter === "medium" && /^0{0,1}[1-2]:/.test(item.duration)) ||
      (libraryDurationFilter === "long" && !/^0{0,1}[0-2]:/.test(item.duration));
    return matchesTerm && matchesGroup && matchesResolution && matchesDuration;
  });
}

export function filterConfigDriveRows(driveLibrary: DriveLibraryItem[], configDriveSearch: string, configDriveGroupFilter: string) {
  const term = configDriveSearch.trim().toLowerCase();
  return driveLibrary.filter((item) => {
    const matchesTerm =
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.group.toLowerCase().includes(term) ||
      item.url.toLowerCase().includes(term) ||
      item.duration.toLowerCase().includes(term) ||
      item.resolution.toLowerCase().includes(term) ||
      item.size.toLowerCase().includes(term);
    const matchesGroup = configDriveGroupFilter === "all" || item.group === configDriveGroupFilter;
    return matchesTerm && matchesGroup;
  });
}
