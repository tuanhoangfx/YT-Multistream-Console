import { type Dispatch, type SetStateAction, useEffect } from "react";
import { hasDriveValue, type DriveLibraryItem, type DriveMetadataProbeMode, type DriveMetadataStatus } from "./drive-utils";

type ProbeResult = {
  name?: string;
  duration?: string;
  resolution?: string;
  size?: string;
  message?: string;
  probeMode?: DriveMetadataProbeMode;
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
  probeDriveLink: (url: string, probeMode?: DriveMetadataProbeMode) => Promise<ProbeResult>;
}) {
  useEffect(() => {
    const scanSlots = Math.max(0, MAX_PARALLEL_METADATA_SCANS - metadataLoadingIds.length);
    if (scanSlots === 0) return;

    const pendingQuickItems = driveLibrary.filter((entry) => !metadataLoadingIds.includes(entry.id) && entry.metadataStatus === "pending" && entry.metadataProbeMode !== "deep");
    const pendingDeepItems = driveLibrary.filter((entry) => !metadataLoadingIds.includes(entry.id) && entry.metadataStatus === "pending" && entry.metadataProbeMode === "deep");
    const pendingItems = (pendingQuickItems.length > 0 ? pendingQuickItems : pendingDeepItems).slice(0, scanSlots);
    if (pendingItems.length === 0) return;

    const pendingIds = pendingItems.map((item) => item.id);
    setMetadataLoadingIds((ids) => Array.from(new Set([...ids, ...pendingIds])));
    setDriveLibrary((items) =>
      items.map((entry) =>
        pendingIds.includes(entry.id)
          ? {
              ...entry,
              metadataStatus: "scanning",
              metadataMessage: entry.metadataProbeMode === "deep" ? "Reading long video metadata..." : "Reading Google Drive metadata..."
            }
          : entry
      )
    );

    pendingItems.forEach((item) => {
      const probeMode = item.metadataProbeMode === "deep" ? "deep" : "quick";
      probeDriveLink(item.url, probeMode)
        .then((metadata) => {
          const duration = metadata.duration || item.duration;
          const resolution = metadata.resolution || item.resolution;
          const size = metadata.size || item.size;
          const hasDuration = hasDriveValue(duration);
          const hasResolution = hasDriveValue(resolution);
          const shouldDeferDeepProbe = probeMode === "quick" && !(hasDuration && hasResolution);
          if (shouldDeferDeepProbe) {
            setDriveLibrary((items) =>
              items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      name: metadata.name || entry.name,
                      duration: duration === "Auto" ? "-" : duration,
                      resolution: resolution === "Auto" ? "-" : resolution,
                      size: size === "Auto" ? "-" : size,
                      metadataStatus: "pending",
                      metadataMessage: "Queued for long video metadata scan after shorter videos.",
                      metadataChecked: false,
                      metadataProbeMode: "deep"
                    }
                  : entry
              )
            );
            return;
          }
          const metadataStatus: DriveMetadataStatus = hasDuration && hasResolution ? "ready" : hasDuration || hasResolution ? "partial" : "error";

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
                    metadataMessage:
                      metadata.message ||
                      (metadataStatus === "ready"
                        ? "Metadata generated."
                        : metadataStatus === "partial"
                          ? "Only partial media metadata was available."
                          : "Could not read media metadata. Keep link if stream can still start."),
                    metadataChecked: true,
                    metadataProbeMode: probeMode
                  }
                : entry
            )
          );
        })
        .catch(() => {
          if (probeMode === "quick") {
            setDriveLibrary((items) =>
              items.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      metadataStatus: "pending",
                      metadataMessage: "Queued for long video metadata scan after shorter videos.",
                      metadataChecked: false,
                      metadataProbeMode: "deep"
                    }
                  : entry
              )
            );
            return;
          }
          setDriveLibrary((items) =>
            items.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    metadataStatus: "error",
                    metadataMessage: "Unable to read metadata. Keep link if stream can still start.",
                    metadataChecked: true,
                    metadataProbeMode: probeMode
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
