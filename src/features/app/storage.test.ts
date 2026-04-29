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

  it("persists and reads drive library", () => {
    const library = readDriveLibrary();
    library[0].name = "Renamed Drive Video";
    persistDriveLibrary(library);
    expect(readDriveLibrary()[0].name).toBe("Renamed Drive Video");
  });
});
