import { type Dispatch, type SetStateAction, useEffect } from "react";
import { hasDriveValue, type DriveLibraryItem, type DriveMetadataStatus } from "./drive-utils";

type ProbeResult = {
  name?: string;
  duration?: string;
  resolution?: string;
  size?: string;
  message?: string;
};

export function useDriveMetadataScanner({
  driveLibrary,
  metadataLoadingIds,
  setMetadataLoadingIds,
  setDriveLibrary,
  setError,
  probeDriveLink
}: {
  driveLibrary: DriveLibraryItem[];
  metadataLoadingIds: string[];
  setMetadataLoadingIds: Dispatch<SetStateAction<string[]>>;
  setDriveLibrary: Dispatch<SetStateAction<DriveLibraryItem[]>>;
  setError: Dispatch<SetStateAction<string>>;
  probeDriveLink: (url: string) => Promise<ProbeResult>;
}) {
  useEffect(() => {
    const item = driveLibrary.find((entry) => !metadataLoadingIds.includes(entry.id) && entry.metadataStatus === "pending");
    if (!item) return;

    setMetadataLoadingIds((ids) => [...ids, item.id]);
    setDriveLibrary((items) => items.map((entry) => (entry.id === item.id ? { ...entry, metadataStatus: "scanning", metadataMessage: "Reading Google Drive metadata..." } : entry)));

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
        setError("Unable to read metadata for one or more Drive links.");
      })
      .finally(() => {
        setMetadataLoadingIds((ids) => ids.filter((id) => id !== item.id));
      });
  }, [driveLibrary, metadataLoadingIds, probeDriveLink, setDriveLibrary, setError, setMetadataLoadingIds]);
}
