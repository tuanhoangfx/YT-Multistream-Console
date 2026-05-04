import { type Dispatch, type SetStateAction, useEffect } from "react";
import { hasDriveValue, type DriveLibraryItem, type DriveMetadataStatus } from "./drive-utils";

type ProbeResult = {
  name?: string;
  duration?: string;
  resolution?: string;
  size?: string;
  message?: string;
};

const MAX_PARALLEL_METADATA_SCANS = 3;

export function useDriveMetadataScanner({
  driveLibrary,
  metadataLoadingIds,
  setMetadataLoadingIds,
  setDriveLibrary,
  probeDriveLink
}: {
  driveLibrary: DriveLibraryItem[];
  metadataLoadingIds: string[];
  setMetadataLoadingIds: Dispatch<SetStateAction<string[]>>;
  setDriveLibrary: Dispatch<SetStateAction<DriveLibraryItem[]>>;
  probeDriveLink: (url: string) => Promise<ProbeResult>;
}) {
  useEffect(() => {
    const scanSlots = Math.max(0, MAX_PARALLEL_METADATA_SCANS - metadataLoadingIds.length);
    if (scanSlots === 0) return;

    const pendingItems = driveLibrary.filter((entry) => !metadataLoadingIds.includes(entry.id) && entry.metadataStatus === "pending").slice(0, scanSlots);
    if (pendingItems.length === 0) return;

    const pendingIds = pendingItems.map((item) => item.id);
    setMetadataLoadingIds((ids) => Array.from(new Set([...ids, ...pendingIds])));
    setDriveLibrary((items) =>
      items.map((entry) => (pendingIds.includes(entry.id) ? { ...entry, metadataStatus: "scanning", metadataMessage: "Reading Google Drive metadata..." } : entry))
    );

    pendingItems.forEach((item) => {
      probeDriveLink(item.url)
        .then((metadata) => {
          const duration = metadata.duration || item.duration;
          const resolution = metadata.resolution || item.resolution;
          const size = metadata.size || item.size;
          const hasDuration = hasDriveValue(duration);
          const hasResolution = hasDriveValue(resolution);
          const hasSize = hasDriveValue(size);
          const hasName = Boolean(metadata.name && metadata.name !== "Drive video");
          const metadataStatus: DriveMetadataStatus = hasDuration && hasResolution ? "ready" : hasName || hasDuration || hasResolution || hasSize ? "partial" : "error";

          setDriveLibrary((items) =>
            items.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    name: metadata.name || entry.name,
                    duration: duration === "Auto" ? "-" : duration,
                    resolution: resolution === "Auto" ? "-" : resolution,
                    size: size === "Auto" ? "-" : size,
                    metadataStatus,
                    metadataMessage: metadata.message || (metadataStatus === "ready" ? "Metadata generated." : "Only partial metadata was available."),
                    metadataChecked: true
                  }
                : entry
            )
          );
        })
        .catch(() => {
          setDriveLibrary((items) =>
            items.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    metadataStatus: "error",
                    metadataMessage: "Unable to read metadata. Keep link if stream can still start.",
                    metadataChecked: true
                  }
                : entry
            )
          );
        })
        .finally(() => {
          setMetadataLoadingIds((ids) => ids.filter((id) => id !== item.id));
        });
      });
  }, [driveLibrary, metadataLoadingIds, probeDriveLink, setDriveLibrary, setMetadataLoadingIds]);
}
