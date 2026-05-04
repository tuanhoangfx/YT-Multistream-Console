const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streaming", {
  pickLocalVideo: () => ipcRenderer.invoke("stream:pick-local-video"),
  startJob: (payload) => ipcRenderer.invoke("stream:start", payload),
  stopJob: (payload) => ipcRenderer.invoke("stream:stop", payload),
  stopAllJobs: () => ipcRenderer.invoke("stream:stop-all"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  checkFfmpeg: () => ipcRenderer.invoke("stream:check-ffmpeg"),
  readReleaseLog: () => ipcRenderer.invoke("release-log:read"),
  scanDriveFolder: (payload) => ipcRenderer.invoke("drive:scan-folder", payload),
  probeDriveLink: (payload) => ipcRenderer.invoke("drive:probe-link", payload),
  onJobEvent: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("stream:job-event", listener);
    return () => ipcRenderer.removeListener("stream:job-event", listener);
  }
});
