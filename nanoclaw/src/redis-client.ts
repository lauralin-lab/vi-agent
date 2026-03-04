import Redis from 'ioredis';
import { config } from './config.js';

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/** Main Redis client for publish / get / set / xadd */
export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }
  return redisClient;
}

/** Dedicated subscriber client (cannot be shared with publish) */
export function getSubscriber(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }
  return subscriberClient;
}

/** Connect both clients */
export async function connectRedis(): Promise<void> {
  const pub = getRedis();
  const sub = getSubscriber();
  await Promise.all([pub.connect(), sub.connect()]);
  console.log('[redis] connected');
}

/** Disconnect both clients */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
  if (subscriberClient) {
    subscriberClient.disconnect();
    subscriberClient = null;
  }
  console.log('[redis] disconnected');
}
