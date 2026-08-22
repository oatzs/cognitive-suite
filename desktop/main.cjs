const { app, BrowserWindow, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const APP_SCHEME = 'quadbox'
const APP_HOST = 'app'
const DIST_PATH = path.resolve(__dirname, '..', 'dist')

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
])

function response(status, message) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

function resolveAppPath(requestUrl) {
  const url = new URL(requestUrl)
  if (url.host !== APP_HOST) return null

  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const filePath = path.resolve(DIST_PATH, `.${requestedPath}`)
  const relativePath = path.relative(DIST_PATH, filePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
  return filePath
}

async function registerAppProtocol() {
  await protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveAppPath(request.url)
    if (!filePath) return response(400, 'Invalid application path')
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return response(404, 'Not found')
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function openExternal(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(parsed.toString())
    }
  } catch {
    // Ignore malformed external URLs.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`)) {
      event.preventDefault()
      openExternal(url)
    }
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  void window.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`)
  return window
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  let mainWindow
  app.setAppUserModelId('org.quadbox.cognitive-suite')

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    await registerAppProtocol()
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
