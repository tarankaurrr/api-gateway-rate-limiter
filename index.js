require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const { Redis } = require('@upstash/redis');

const app = express();
const redis = Redis.fromEnv();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many requests! Please wait a minute and try again.'
});

app.use(limiter);

app.use(async (req, res, next) => {
  const cacheKey = `cache:${req.originalUrl}`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    console.log('Serving from CACHE:', req.originalUrl);
    return res.json(cachedData);
  }
      
  next();
});

app.use('/', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
      let body = [];
      proxyRes.on('data', (chunk) => body.push(chunk));
      proxyRes.on('end', async () => {
        body = Buffer.concat(body).toString();
        const cacheKey = `cache:${req.originalUrl}`;
        try {
          const jsonData = JSON.parse(body);
          await redis.set(cacheKey, jsonData, { ex: 30 });
          console.log('Saved to CACHE:', req.originalUrl);
        } catch (e) {}
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
        res.end(body);
      });
    }
  }
}));

app.listen(4000, () => {
  console.log('Gateway is running on http://localhost:4000');
});