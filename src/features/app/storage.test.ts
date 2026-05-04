import { beforeEach, describe, expect, it } from "vitest";
import { persistDriveLibrary, persistJobs, persistTheme, readDriveLibrary, readJobs, readTheme } from "./storage";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and reads theme", () => {
    persistTheme("light");
    expect(readTheme()).toBe("light");
  });

  it("returns default jobs when empty", () => {
    const jobs = readJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].channelName).toBe("Channel A");
  });

  it("persists and reads jobs", () => {
    const seed = readJobs();
    seed[0].channelName = "Test Channel";
    persistJobs(seed);
    expect(readJobs()[0].channelName).toBe("Test Channel");
  });

  it("migrates legacy localPath into localPaths", () => {
    localStorage.setItem(
      "yt-multistream-jobs",
      JSON.stringify([
        {
          id: "job-1",
          channelName: "Legacy Local",
          sourceType: "local",
          localPath: "C:\\videos\\a.mp4",
          primaryRtmpUrl: "rtmp://example/live",
          rtmpBase: "",
          streamKey: ""
        }
      ])
    );

    const [job] = readJobs();
    expect(job.localPath).toBe("C:\\videos\\a.mp4");
    expect(job.localPaths).toEqual(["C:\\videos\\a.mp4"]);
  });

  it("persists multiple local video selections", () => {
    const seed = readJobs();
    seed[0].localPath = "C:\\videos\\a.mp4";
    seed[0].localPaths = ["C:\\videos\\a.mp4", "C:\\videos\\b.mp4"];
    persistJobs(seed);
    expect(readJobs()[0].localPaths).toEqual(["C:\\videos\\a.mp4", "C:\\videos\\b.mp4"]);
  });

  it("persists and reads drive library", () => {
    const library = readDriveLibrary();
    library[0].name = "Renamed Drive Video";
    persistDriveLibrary(library);
    expect(readDriveLibrary()[0].name).toBe("Renamed Drive Video");
  });
});
