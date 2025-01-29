const fetch = require("node-fetch");
const HttpsProxyAgent = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");
const readline = require("readline");
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs').promises;
const kleur = require('kleur');
const banner = require('./banner');

// Configuration
const config = {
  token: "",
  baseUrl: "https://app.despeed.net",
  checkInterval: 60000,
  location: {
    latitude: 39.904202,
    longitude: 116.407394
  },
  proxy: {
    enabled: false,
    type: "http",
    url: "",
    timeout: 10000,
    maxRetries: 3,
    testUrl: "https://api.ipify.org?format=json",
    currentIndex: 0
  }
};

const logger = {
  info: (msg) => console.log(kleur.blue('â„¹'), kleur.white(msg)),
  success: (msg) => console.log(kleur.green('âœ”'), kleur.white(msg)),
  warning: (msg) => console.log(kleur.yellow('âš '), kleur.white(msg)),
  error: (msg) => console.log(kleur.red('âœ–'), kleur.white(msg)),
  speed: (msg) => console.log(kleur.cyan('â†¯'), kleur.white(msg)),
  time: (msg) => console.log(kleur.magenta('â°'), kleur.white(msg)),
  location: (msg) => console.log(kleur.yellow('ðŸ“'), kleur.white(msg)),
  network: (msg) => console.log(kleur.blue('ðŸŒ'), kleur.white(msg))
};

let proxyList = [];

function generateRandomLocation() {
  const bounds = {
    minLat: 18.0,
    maxLat: 53.55,
    minLng: 73.66,
    maxLng: 135.05
  };
  
  const latitude = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
  const longitude = bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng);
  
  return {
    latitude: Math.round(latitude * 1000000) / 1000000,
    longitude: Math.round(longitude * 1000000) / 1000000
  };
}

async function loadProxiesFromFile() {
  try {
    const content = await fs.readFile('proxy.txt', 'utf8');
    const lines = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    );

    proxyList = lines.map(line => {
      let type = 'http';
      let url = line.trim();

      if (url.startsWith('socks4://')) {
        type = 'socks4';
      } else if (url.startsWith('socks5://')) {
        type = 'socks5';
      } else if (!url.includes('://')) {
        url = `http://${url}`;
      }

      return { type, url };
    });

    if (proxyList.length > 0) {
      config.proxy.enabled = true;
      logger.success(`Loaded ${proxyList.length} proxies from proxy.txt`);
      return true;
    }

    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Error reading proxy file: ${error.message}`);
    }
    return false;
  }
}

function getNextProxy() {
  if (proxyList.length === 0) return null;
  
  const proxy = proxyList[config.proxy.currentIndex];
  config.proxy.currentIndex = (config.proxy.currentIndex + 1) % proxyList.length;
  
  return proxy;
}

async function createProxyAgent() {
  const proxy = getNextProxy();
  if (!proxy) return undefined;

  config.proxy.type = proxy.type;
  config.proxy.url = proxy.url;

  try {
    if (proxy.type === 'http') {
      return new HttpsProxyAgent({
        proxy: proxy.url,
        timeout: config.proxy.timeout,
        keepAlive: true,
        maxFreeSockets: 256,
        maxSockets: 256
      });
    } else {
      return new SocksProxyAgent({
        proxy: proxy.url,
        timeout: config.proxy.timeout,
        keepAlive: true,
        type: proxy.type === 'socks4' ? 4 : 5
      });
    }
  } catch (error) {
    logger.error(`Failed to create proxy agent: ${error.message}`);
    return undefined;
  }
}

async function isProxyAlive(proxyAgent) {
  try {
    const response = await fetch(config.proxy.testUrl, {
      agent: proxyAgent,
      timeout: config.proxy.timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      logger.success(`Proxy IP: ${data.ip}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function getProxyAgent(retries = config.proxy.maxRetries) {
  if (!config.proxy.enabled || proxyList.length === 0) return undefined;

  const initialIndex = config.proxy.currentIndex;
  let attempts = 0;

  while (attempts < retries * proxyList.length) {
    try {
      const agent = await createProxyAgent();
      if (!agent) {
        return undefined;
      }

      if (await isProxyAlive(agent)) {
        logger.success(`Proxy connection established (${config.proxy.type})`);
        return agent;
      }

      logger.warning(`Proxy check failed, trying next proxy...`);
      if (config.proxy.currentIndex === initialIndex) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (Math.floor(attempts / proxyList.length) + 1)));
      }

    } catch (error) {
      logger.error(`Proxy error: ${error.message}`);
    }
    
    attempts++;
  }

  throw new Error('All proxies failed after maximum retry attempts');
}

async function initConfig() {
  logger.info('Starting configuration setup...');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  config.token = await question(kleur.cyan('Enter your DeSpeed token: '));

  const proxyFileExists = await loadProxiesFromFile();
  if (!proxyFileExists) {
    const useProxy = (await question(kleur.cyan('No proxy.txt found or empty. Use manual proxy? (y/n): '))).toLowerCase() === 'y';
    if (useProxy) {
      config.proxy.enabled = true;
      const proxyUrl = await question(kleur.cyan('Enter proxy URL (e.g., http://user:pass@ip:port or socks5://ip:port): '));
      proxyList.push({
        type: proxyUrl.startsWith('socks4://') ? 'socks4' : 
              proxyUrl.startsWith('socks5://') ? 'socks5' : 'http',
        url: proxyUrl
      });
    }
  }

  const interval = await question(kleur.cyan('Enter check interval (minutes, default 1): '));
  config.checkInterval = (parseInt(interval) || 1) * 60000;

  rl.close();

  config.location = generateRandomLocation();
  logger.location(`Test location: ${config.location.latitude}, ${config.location.longitude}`);

  logger.success('Configuration completed!');
  logger.info('Current settings:');
  const displayConfig = { ...config };
  if (proxyList.length > 0) {
    displayConfig.proxy.proxies = `${proxyList.length} proxies loaded`;
  }
  console.log(kleur.gray(JSON.stringify(displayConfig, null, 2)));
}

async function validateToken() {
  if (!config.token) {
    throw new Error('Token not found');
  }
  
  try {
    const tokenData = JSON.parse(atob(config.token.split('.')[1]));
    if ((tokenData.exp - 90) * 1000 < Date.now()) {
      throw new Error('Token expired');
    }

    const proxyAgent = await getProxyAgent();
    const profileResponse = await fetch(`${config.baseUrl}/v1/api/auth/profile`, {
      headers: getCommonHeaders(),
      agent: proxyAgent,
      timeout: 30000
    });

    if (!profileResponse.ok) {
      throw new Error('Token invalid');
    }
  } catch (error) {
    logger.error(`Token validation failed: ${error.message}`);
    throw error;
  }
}

function getCommonHeaders() {
  return {
    'Authorization': `Bearer ${config.token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'sec-ch-ua': '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Origin': 'https://app.despeed.net',
    'Referer': 'https://app.despeed.net/dashboard'
  };
}

async function performSpeedTest() {
  try {
    logger.network('Starting network speed measurement...');
    
    const metadata = {
      client_name: 'speed-measurementlab-net-1',
      client_session_id: crypto.randomUUID()
    };

    const proxyAgent = await getProxyAgent();
    
    const locateUrl = new URL('https://locate.measurementlab.net/v2/nearest/ndt/ndt7');
    locateUrl.search = new URLSearchParams(metadata).toString();
    
    logger.info('Locating speed test server...');
    const locateResponse = await fetch(locateUrl, {
      agent: proxyAgent,
      timeout: 30000
    });

    if (!locateResponse.ok) {
      throw new Error(`Failed to get speed test server: ${locateResponse.status}`);
    }

    const serverData = await locateResponse.json();
    if (!serverData.results || !serverData.results[0]) {
      throw new Error('No available speed test server');
    }

    const server = serverData.results[0];
    logger.success(`Selected server: ${server.machine}`);

    const downloadUrl = server.urls['wss:///ndt/v7/download'];
    const uploadUrl = server.urls['wss:///ndt/v7/upload'];

    logger.network('Starting download test...');
    let downloadSpeed = 0;
    await new Promise((resolve) => {
      const wsOptions = config.proxy.enabled ? {
        agent: proxyAgent
      } : undefined;
      
      const ws = new WebSocket(downloadUrl, 'net.measurementlab.ndt.v7', wsOptions);
      let startTime = Date.now();
      let totalBytes = 0;
      let lastMeasurement = null;

      ws.on('open', () => {
        startTime = Date.now();
        totalBytes = 0;
      });

      ws.on('message', (data) => {
        if (typeof data === 'string') {
          lastMeasurement = JSON.parse(data);
          return;
        }
        totalBytes += data.length;
        const now = Date.now();
        const duration = (now - startTime) / 1000;
        if (duration >= 10) {
          downloadSpeed = (totalBytes * 8) / (duration * 1000000);
          ws.close();
        }
      });

      ws.on('close', () => {
        logger.speed(`Download: ${downloadSpeed.toFixed(2)} Mbps`);
        resolve();
      });

      ws.on('error', (error) => {
        logger.error(`Download test error: ${error.message}`);
        resolve();
      });
    });

    logger.network('Starting upload test...');
    let uploadSpeed = 0;
    await new Promise((resolve) => {
      const wsOptions = config.proxy.enabled ? {
        agent: proxyAgent
      } : undefined;
      
      const ws = new WebSocket(uploadUrl, 'net.measurementlab.ndt.v7', wsOptions);
      let startTime = Date.now();
      let totalBytes = 0;
      let lastMeasurement = null;
      let uploadData = Buffer.alloc(32768);
      crypto.randomFillSync(uploadData);

      ws.on('open', () => {
        startTime = Date.now();
        totalBytes = 0;
        const sendData = () => {
          if (ws.readyState === WebSocket.OPEN) {
            const now = Date.now();
            const duration = (now - startTime) / 1000;
            
            if (duration >= 10) {
              uploadSpeed = (totalBytes * 8) / (duration * 1000000);
              ws.close();
              return;
            }

            while (ws.bufferedAmount < 1024 * 1024) {
              ws.send(uploadData);
              totalBytes += uploadData.length;
            }

            setImmediate(sendData);
          }
        };
        sendData();
      });

      ws.on('message', (data) => {
        if (typeof data === 'string') {
          try {
            lastMeasurement = JSON.parse(data);
            if (lastMeasurement.TCPInfo) {
              const tcpInfo = lastMeasurement.TCPInfo;
              const tmpSpeed = (tcpInfo.BytesReceived / tcpInfo.ElapsedTime) * 8;
              if (tmpSpeed > uploadSpeed) {
                uploadSpeed = tmpSpeed;
              }
            }
          } catch (e) {
            logger.error(`Error parsing server message: ${e.message}`);
          }
        }
      });

      ws.on('close', () => {
        logger.speed(`Upload: ${uploadSpeed.toFixed(2)} Mbps`);
        resolve();
      });

      ws.on('error', (error) => {
        logger.error(`Upload test error: ${error.message}`);
        resolve();
      });
    });

    return { downloadSpeed, uploadSpeed };

  } catch (error) {
    logger.error(`Speed test error: ${error.message}`);
    return { downloadSpeed: 0, uploadSpeed: 0 };
  }
}

async function reportResults(downloadSpeed, uploadSpeed) {
  try {
    logger.info('Submitting test results...');

    const proxyAgent = await getProxyAgent();
    const response = await fetch(`${config.baseUrl}/v1/api/points`, {
      method: 'POST',
      headers: {
        ...getCommonHeaders(),
        'Content-Type': 'application/json'
      },
      agent: proxyAgent,
      timeout: 30000,
      body: JSON.stringify({
        download_speed: Math.round(downloadSpeed * 100) / 100,
        upload_speed: Math.round(uploadSpeed * 100) / 100,
        latitude: config.location.latitude,
        longitude: config.location.longitude,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Report failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      logger.success('Results submitted successfully');
      return data;
    } else {
      throw new Error(data.message || 'Report failed');
    }

  } catch (error) {
    logger.error(`Error submitting results: ${error.message}`);
    return null;
  }
}

async function displayAccountInfo() {
  try {
    logger.info('\n=== Account Information ===');
    
    const proxyAgent = await getProxyAgent();
    const profileResponse = await fetch(`${config.baseUrl}/v1/api/auth/profile`, {
      headers: getCommonHeaders(),
      agent: proxyAgent,
      timeout: 30000
    });

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      logger.info(`Username: ${profile.data.username || "Not set"}`);
      logger.info(`Email: ${profile.data.email || "Not set"}`);
    }
    
    logger.info('=== ==================== ===\n');
  } catch (error) {
    logger.error(`Failed to get account information: ${error.message}`);
  }
}

async function main() {
  try {
    logger.info('\n=== Starting speed test ===');
    logger.time(`Time: ${new Date().toLocaleString()}`);
    
    await validateToken();
    logger.success('Token validation successful');
    
    await displayAccountInfo();
    
    config.location = generateRandomLocation();
    logger.location(`Speed test location: ${config.location.latitude}, ${config.location.longitude}`);
    
    logger.network('Starting speed test...');
    const { downloadSpeed, uploadSpeed } = await performSpeedTest();
    logger.speed(`Final Download speed: ${downloadSpeed.toFixed(2)} Mbps`);
    logger.speed(`Final Upload speed: ${uploadSpeed.toFixed(2)} Mbps`);
    
    const result = await reportResults(downloadSpeed, uploadSpeed);
    
    if (result && result.success) {
      logger.success('Speed test completed and results reported');
      await displayAccountInfo();
    } else {
      logger.error('Failed to report results');
      if (result && result.message) {
        logger.error(`Failure reason: ${result.message}`);
      }
    }
    
  } catch (error) {
    logger.error(`Error during speed test: ${error.message}`);
    if (error.response) {
      try {
        const errorData = await error.response.json();
        logger.error(`Server response: ${JSON.stringify(errorData)}`);
      } catch {
        logger.error(`Status code: ${error.response.status}`);
      }
    }
  } finally {
    const nextTime = new Date(Date.now() + config.checkInterval);
    logger.time(`Next test scheduled for: ${nextTime.toLocaleString()}`);
    logger.info(`Interval: ${Math.round(config.checkInterval / 1000 / 60)} minutes`);
    logger.info('=== Speed test cycle complete ===\n');
    setTimeout(main, config.checkInterval);
  }
}

// Handle process exit
process.on('SIGINT', () => {
  logger.warning('\nReceived exit signal');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warning('\nReceived terminate signal');
  process.exit(0);
});

// Start the program
console.clear();
console.log(kleur.cyan(banner));
logger.info('Initializing DeSpeed Test Client...');
initConfig().then(() => {
  main();
}).catch(error => {
  logger.error(`Initialization error: ${error.message}`);
  process.exit(1);
});
