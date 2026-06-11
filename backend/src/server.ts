import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Client } from 'pg';
import Redis from 'ioredis';
import { z } from 'zod';

const server = Fastify({ logger: true });

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
const redisCache = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const redisPubSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Idempotent Verification Schema Validation Layer [cite: 294, 348]
const ProductUpsertSchema = z.object({
  productId: z.string(),
  title: z.string(),
  brand: z.string(),
  category: z.object({
    l1: z.string(),
    l2: z.string()
  }),
  attributes: z.record(z.any()).default({}),
  platforms: z.array(z.any()).default([])
});

// Cursor-Based Pagination Engine: Prevents Page Drift Bugs 
server.get('/api/v1/products', async (request: FastifyRequest, reply: FastifyReply) => {
  const querySchema = z.object({
    limit: z.string().transform(Number).default('10'),
    cursor: z.string().optional()
  });
  
  const parsed = querySchema.parse(request.query);
  let queryText = `SELECT id, product_id, title, brand, category, platforms, enrichment_status FROM products`;
  const queryParams: any[] = [parsed.limit];
  
  if (parsed.cursor) {
    const decodedId = Buffer.from(parsed.cursor, 'base64').toString('utf-8');
    queryText += ` WHERE id > $2 ORDER BY id ASC LIMIT $1`;
    queryParams.push(Number(decodedId));
  } else {
    queryText += ` ORDER BY id ASC LIMIT $1`;
  }
  
  const res = await pgClient.query(queryText, queryParams);
  const nextCursor = res.rows.length === parsed.limit 
    ? Buffer.from(res.rows[res.rows.length - 1].id.toString()).toString('base64') 
    : null;
    
  return reply.status(200).send({
    data: res.rows,
    pagination: { nextCursor }
  });
});

// Idempotent UPSERT Path: Safe against duplicate background tasks 
server.post('/api/v1/products/upsert', async (request: FastifyRequest, reply: FastifyReply) => {
  const validatedData = ProductUpsertSchema.parse(request.body);
  
  const queryStr = `
    INSERT INTO products (product_id, title, brand, category, attributes, platforms, enrichment_status, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'complete', NOW())
    ON CONFLICT (product_id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      attributes = EXCLUDED.attributes,
      platforms = EXCLUDED.platforms,
      updated_at = NOW()
    RETURNING id, product_id;
  `;
  
  const executionValues = [
    validatedData.productId,
    validatedData.title,
    validatedData.brand,
    JSON.stringify(validatedData.category),
    JSON.stringify(validatedData.attributes),
    JSON.stringify(validatedData.platforms)
  ];
  
  const databaseResult = await pgClient.query(queryStr, executionValues);
  
  // Invalidate Cache Keys
  const structuralKeys = await redisCache.keys('cache:/api/v1/products:*');
  if (structuralKeys.length > 0) {
    await redisCache.del(...structuralKeys);
  }
  
  return reply.status(200).send({ status: 'success', identity: databaseResult.rows[0] });
});

// Cache Engine with Thundering Herd TTL Jitter Protection [cite: 311]
server.get('/api/v1/products/compare/:id', async (request: FastifyRequest, reply: FastifyReply) => {
  const paramSchema = z.object({ id: z.string() });
  const { id } = paramSchema.parse(request.params);
  
  const cacheKey = `cache:/api/v1/products:compare:${id}`;
  const volatileCachedData = await redisCache.get(cacheKey);
  
  if (volatileCachedData) {
    return reply.status(200).header('X-Cache-Status', 'HIT').send(JSON.parse(volatileCachedData));
  }
  
  const productLookup = await pgClient.query('SELECT * FROM products WHERE product_id = $1', [id]);
  if (productLookup.rows.length === 0) {
    return reply.status(404).send({ error: 'Targeted aggregate product catalog item not located.' });
  }
  
  const standardTTL = 300; 
  const randomizedJitterVariance = Math.floor(Math.random() * 60) - 30; // +/- 10% Jitter [cite: 311]
  
  await redisCache.setex(cacheKey, standardTTL + randomizedJitterVariance, JSON.stringify(productLookup.rows[0]));
  
  return reply.status(200).header('X-Cache-Status', 'MISS').send(productLookup.rows[0]);
});

// Server-Sent Events (SSE) Stream Channel Architecture 
server.get('/api/v1/stream/price-updates', async (request: FastifyRequest, reply: FastifyReply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  reply.raw.write(`data: ${JSON.stringify({ event: 'system_initialized', epoch: Date.now() })}\n\n`);

  redisPubSub.subscribe('catalog:price-mutation-events');
  
  const eventTransferHandler = (channel: string, message: string) => {
    if (channel === 'catalog:price-mutation-events') {
      reply.raw.write(`event: price_change\ndata: ${message}\n\n`);
    }
  };

  redisPubSub.on('message', eventTransferHandler);

  request.raw.on('close', () => {
    redisPubSub.off('message', eventTransferHandler);
    server.log.info('Terminated real-time streaming connection cleanly.');
  });
});

// Self-Contained Price Change Simulation Routine: Fires Every 15s [cite: 344]
setInterval(async () => {
  try {
    const randomProduct = await pgClient.query('SELECT product_id, title FROM products ORDER BY RANDOM() LIMIT 1');
    if (randomProduct.rows.length > 0) {
      const target = randomProduct.rows[0];
      const mockNewPrice = Math.floor(Math.random() * (4500 - 2500) + 2500);
      
      const payload = {
        productId: target.product_id,
        title: target.title,
        platform: Math.random() > 0.5 ? 'Amazon' : 'Flipkart',
        new_price: mockNewPrice,
        timestamp: new Date().toISOString()
      };
      
      await redisCache.publish('catalog:price-mutation-events', JSON.stringify(payload));
    }
  } catch (err) {
    console.error('Simulation ticking error:', err);
  }
}, 15000);

const start = async () => {
  try {
    await pgClient.connect();
    await server.register(cors, { origin: true });
    await server.listen({ port: 8080, host: '0.0.0.0' });
  } catch (err) {
    process.exit(1);
  }
};
start();