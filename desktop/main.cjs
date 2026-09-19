'use strict'

const { app, BrowserWindow, shell, session } = require('electron')
const path = require('node:path')

const APP_ID = 'com.timetable.desktop'
const isDevelopment = !app.isPackaged

app.setAppUserModelId(APP_ID)

function isAllowedInternalNavigation(url) {
  if (isDevelopment) return url.startsWith('http://127.0.0.1:5173') || url.startsWith('http://localhost:5173')
  return url.startsWith('file://')
}

function openExternalSafely(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(url)
    }
  } catch {
    // Ignore malformed/untrusted URLs.
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedInternalNavigation(url)) {
      event.preventDefault()
      openExternalSafely(url)
    }
  })

  win.once('ready-to-show', () => win.show())

  if (isDevelopment && process.env.TIMETABLE_DESKTOP_DEV_URL) {
    void win.loadURL(process.env.TIMETABLE_DESKTOP_DEV_URL)
  } else {
    void win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
