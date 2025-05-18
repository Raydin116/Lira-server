const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// API URLs
const LIRAT_API_URL = 'https://lirat.org/wp-json/alba-cur/cur/1.json';
const DAMASCUS_HISTORY_API = 'https://lirat.org/wp-json/currency-route/currency/9/damascus.json';
const ALEPPO_HISTORY_API = 'https://lirat.org/wp-json/currency-route/currency/9/aleppo.json';
const IDLIB_HISTORY_API = 'https://lirat.org/wp-json/currency-route/currency/9/idlib.json';

// Cache data with expiration
const cache = {
  data: {},
  timestamps: {}
};

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// Check if cache is valid
function isCacheValid(key) {
  const timestamp = cache.timestamps[key];
  return timestamp && (Date.now() - timestamp) < CACHE_DURATION;
}

// Proxy route for latest exchange rates
app.get('/api/rates', async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true';
    
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid('rates')) {
      return res.json(cache.data.rates);
    }
    
    // Add timestamp to URL to prevent browser caching
    const timestamp = Date.now();
    const response = await axios.get(`${LIRAT_API_URL}?_t=${timestamp}`);
    
    // Cache the response
    cache.data.rates = response.data;
    cache.timestamps.rates = Date.now();
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching exchange rates:', error.message);
    
    // Return cached data if available, even if expired
    if (cache.data.rates) {
      res.json(cache.data.rates);
    } else {
      res.status(500).json({ error: 'Failed to fetch exchange rates' });
    }
  }
});

// Proxy routes for historical data by city
app.get('/api/history/:city', async (req, res) => {
  const { city } = req.params;
  const forceRefresh = req.query.force === 'true';
  const cacheKey = `history_${city}`;
  
  try {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid(cacheKey)) {
      return res.json(cache.data[cacheKey]);
    }
    
    let apiUrl;
    switch (city.toLowerCase()) {
      case 'damascus':
        apiUrl = DAMASCUS_HISTORY_API;
        break;
      case 'aleppo':
        apiUrl = ALEPPO_HISTORY_API;
        break;
      case 'idlib':
        apiUrl = IDLIB_HISTORY_API;
        break;
      default:
        return res.status(400).json({ error: `Unknown city: ${city}` });
    }
    
    // Add timestamp to URL to prevent browser caching
    const timestamp = Date.now();
    const response = await axios.get(`${apiUrl}?_t=${timestamp}`);
    
    // Cache the response
    cache.data[cacheKey] = response.data;
    cache.timestamps[cacheKey] = Date.now();
    
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching historical data for ${city}:`, error.message);
    
    // Return cached data if available, even if expired
    if (cache.data[cacheKey]) {
      res.json(cache.data[cacheKey]);
    } else {
      res.status(500).json({ error: `Failed to fetch historical data for ${city}` });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Clear cache endpoint (for admin use)
app.post('/api/cache/clear', (req, res) => {
  cache.data = {};
  cache.timestamps = {};
  res.json({ success: true, message: 'Cache cleared successfully' });
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
}); 