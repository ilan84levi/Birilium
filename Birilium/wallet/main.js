const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let nodeProcess = null;
let nodeStarted = false;

// Path to the blockchain node (bundled inside wallet)
const NODE_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'node-backend', 'node.js')
  : path.join(__dirname, 'node-backend', 'node.js');

// Path to .env file
const ENV_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'node-backend', '.env')
  : path.join(__dirname, 'node-backend', '.env');

function sendDebugLog(message) {
  console.log(message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug-log', message);
  }
}

function startBlockchainNode() {
  return new Promise((resolve, reject) => {
    sendDebugLog('==> startBlockchainNode() called');
    sendDebugLog('==> NODE_PATH: ' + NODE_PATH);
    sendDebugLog('==> Checking if node.js exists...');

    // Check if node.js exists
    if (!fs.existsSync(NODE_PATH)) {
      const errorMsg = 'Blockchain node not found at: ' + NODE_PATH;
      console.error(errorMsg);
      sendDebugLog('==> ERROR: ' + errorMsg);
      reject(new Error(errorMsg));
      return;
    }

    sendDebugLog('==> node.js file found!');
    sendDebugLog('==> Starting integrated blockchain node...');
    sendDebugLog('==> Node path: ' + NODE_PATH);
    sendDebugLog('==> Working directory: ' + path.dirname(NODE_PATH));

    // Load environment variables from .env if it exists
    let envVars = {};
    sendDebugLog('==> Checking for .env file at: ' + ENV_PATH);
    if (fs.existsSync(ENV_PATH)) {
      sendDebugLog('==> .env file found, loading...');
      try {
        const envContent = fs.readFileSync(ENV_PATH, 'utf8');
        envContent.split('\n').forEach(line => {
          const match = line.match(/^([^=:#]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            envVars[key] = value;
          }
        });
      } catch (error) {
        sendDebugLog('==> WARNING: Could not load .env file: ' + error.message);
      }
    } else {
      sendDebugLog('==> WARNING: .env file not found');
    }

    // Get the working directory for the node
    const nodeCwd = path.dirname(NODE_PATH);
    sendDebugLog('==> About to spawn node process...');
    sendDebugLog('==> Command: node ' + NODE_PATH);
    sendDebugLog('==> Working dir: ' + nodeCwd);

    // Set up writable directories in AppData for packaged app
    const userDataPath = app.getPath('userData');
    const logsPath = path.join(userDataPath, 'logs');
    const dataPath = path.join(userDataPath, 'data');

    sendDebugLog('==> User data path: ' + userDataPath);
    sendDebugLog('==> Logs path: ' + logsPath);
    sendDebugLog('==> Data path: ' + dataPath);

    // Start the node process with environment variables
    nodeProcess = spawn('node', [NODE_PATH], {
      cwd: nodeCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, // Hide console window on Windows
      detached: false,
      env: {
        ...process.env,
        ...envVars, // Load from .env file
        HTTP_PORT: envVars.HTTP_PORT || process.env.HTTP_PORT || '3001',
        P2P_PORT: envVars.P2P_PORT || process.env.P2P_PORT || '6001',
        API_KEY: envVars.API_KEY || process.env.API_KEY || '',
        NODE_ENV: process.env.NODE_ENV || 'production',
        // Writable paths for packaged app
        LOG_FILE: path.join(logsPath, 'node.log'),
        LEVELDB_PATH: path.join(dataPath, 'chainstate'),
        SQLITE_DB_PATH: path.join(dataPath, 'birilium.db'),
        // PayPal configuration
        PAYPAL_MODE: envVars.PAYPAL_MODE || process.env.PAYPAL_MODE || 'live',
        PAYPAL_CLIENT_ID: envVars.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '',
        PAYPAL_CLIENT_SECRET: envVars.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || '',
        PAYPAL_PLAN_ID: envVars.PAYPAL_PLAN_ID || process.env.PAYPAL_PLAN_ID || ''
      }
    });

    sendDebugLog('==> Node process spawned successfully');
    sendDebugLog('==> Waiting for node startup confirmation...');

    // Handle node output
    nodeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Node]', output);
      sendDebugLog('[Node stdout] ' + output);

      // Send to renderer if window exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('node-log', output);
      }

      // Check if node has started successfully
      if (output.includes('HTTP API') || output.includes('BIRILIUM') || output.includes('Metrics:')) {
        if (!nodeStarted) {
          nodeStarted = true;
          console.log('✓ Blockchain node started successfully');
          resolve();
        }
      }
    });

    nodeProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error('[Node Error]', output);
      sendDebugLog('[Node stderr] ' + output);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('node-error', output);
      }
    });

    nodeProcess.on('error', (err) => {
      const errorMsg = 'Failed to spawn node process: ' + err.message;
      console.error(errorMsg, err);
      sendDebugLog('==> ERROR: ' + errorMsg);
      sendDebugLog('==> Error code: ' + err.code);
      sendDebugLog('==> Error stack: ' + err.stack);
      reject(err);
    });

    nodeProcess.on('exit', (code, signal) => {
      const exitMsg = `Blockchain node exited with code ${code}, signal ${signal}`;
      console.log(exitMsg);
      sendDebugLog('==> ' + exitMsg);
      nodeProcess = null;
      nodeStarted = false;
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!nodeStarted) {
        sendDebugLog('==> ERROR: Node startup timeout after 30 seconds');
        reject(new Error('Node startup timeout'));
      }
    }, 30000);
  });
}

function stopBlockchainNode() {
  return new Promise((resolve) => {
    if (nodeProcess) {
      console.log('Stopping blockchain node...');

      nodeProcess.on('exit', () => {
        console.log('✓ Blockchain node stopped');
        nodeProcess = null;
        resolve();
      });

      // Try graceful shutdown first
      nodeProcess.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (nodeProcess) {
          console.log('Force killing blockchain node...');
          nodeProcess.kill('SIGKILL');
          nodeProcess = null;
          resolve();
        }
      }, 5000);
    } else {
      resolve();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // TEMPORARY FIX: Enable nodeIntegration for renderer-wallet.js to work
      // TODO: Refactor renderer to use only preload API
      nodeIntegration: true,             // TEMP: Enabled for crypto libraries
      contextIsolation: false,           // TEMP: Disabled for compatibility
      sandbox: false,                    // TEMP: Disabled for node access
      enableRemoteModule: false,         // Disable legacy remote module
      preload: path.join(__dirname, 'preload.js'),  // Secure bridge
      webSecurity: true,                 // Enable web security
      allowRunningInsecureContent: false // Block insecure content
    },
    title: 'Birilium Wallet - Integrated Mining Node',
    icon: path.join(__dirname, 'icon.png') // Icon is in birilium-wallet folder
  });

  mainWindow.loadFile('index.html');

  // SECURITY: Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigation to local files
    if (!url.startsWith('file://')) {
      event.preventDefault();
      console.warn('Blocked navigation to:', url);
    }
  });

  // SECURITY: Block new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Block all window.open() calls
    console.warn('Blocked window.open() to:', url);
    return { action: 'deny' };
  });

  // SECURITY: Handle external links safely
  mainWindow.webContents.on('will-redirect', (event, url) => {
    event.preventDefault();
    console.warn('Blocked redirect to:', url);
  });

  // Open DevTools ONLY in development mode (not in production)
  // Users can still open with F12/CTRL+I if needed
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle admin panel access via keyboard shortcut
  // Press CTRL+ALT+A to access admin panel
  require('electron').globalShortcut.register('Control+Alt+A', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const adminUrl = 'http://localhost:3001/api/admin';
      require('electron').shell.openExternal(adminUrl);
    }
  });

  // Disable F12/DevTools in production, but allow CTRL+Shift+I for development
  // Users can still open console with F12 if they really want, but it won't auto-open

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Send node status to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('node-status', {
      started: nodeStarted,
      apiUrl: `http://localhost:${process.env.HTTP_PORT || '3001'}`
    });
  });
}

// IPC handlers
ipcMain.handle('get-node-status', () => {
  return {
    started: nodeStarted,
    apiUrl: `http://localhost:${process.env.HTTP_PORT || '3001'}`,
    p2pPort: process.env.P2P_PORT || '6001'
  };
});

ipcMain.handle('restart-node', async () => {
  try {
    await stopBlockchainNode();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await startBlockchainNode();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App lifecycle
app.on('ready', async () => {
  console.log('====== ELECTRON APP READY ======');

  // Create window first so we can send debug messages to it
  createWindow();

  // Wait a bit for window to load before starting node
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    sendDebugLog('====== ELECTRON APP READY ======');
    sendDebugLog('==> Attempting to start blockchain node...');
    await startBlockchainNode();
    sendDebugLog('==> Blockchain node started successfully!');
  } catch (error) {
    const errorMsg = 'Failed to start application: ' + error.message;
    console.error(errorMsg);
    console.error('Error stack:', error.stack);
    sendDebugLog('==> CRITICAL ERROR: ' + errorMsg);
    sendDebugLog('==> Error stack: ' + error.stack);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('node-error',
        `Failed to start blockchain node: ${error.message}`
      );
    }
  }
});

app.on('window-all-closed', async function () {
  // Stop the blockchain node
  await stopBlockchainNode();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  if (nodeProcess) {
    event.preventDefault();
    await stopBlockchainNode();
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
