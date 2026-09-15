export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'bizzhouse',
    password: process.env.DATABASE_PASSWORD || 'bizzhouse_dev_2026',
    name: process.env.DATABASE_NAME || 'bizzhouse',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  gupshup: {
    baseUrl: process.env.GUPSHUP_BASE_URL || 'https://partner.gupshup.io',
    email: process.env.GUPSHUP_EMAIL || '',
    clientSecret: process.env.GUPSHUP_CLIENT_SECRET || '',
    // Public base URL of THIS api — used as the Gupshup v3 callback target
    // (must be reachable from the internet in production, e.g. https://api.bizzhouse.com)
    callbackBaseUrl: process.env.PUBLIC_API_BASE_URL || process.env.API_URL || 'http://localhost:3001',
    // Shared secret echoed back as X-Gupshup-Webhook-Secret on every callback
    webhookSecret: process.env.GUPSHUP_WEBHOOK_SECRET || '',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    mockMode: process.env.RAZORPAY_MOCK_MODE === 'true',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || 'bizzhouse',
    secretKey: process.env.S3_SECRET_KEY || 'bizzhouse_minio_2026',
    bucket: process.env.S3_BUCKET || 'bizzhouse-media',
    region: process.env.S3_REGION || 'us-east-1',
  },

  webhook: {
    ipWhitelist: process.env.WEBHOOK_IP_WHITELIST
      ? process.env.WEBHOOK_IP_WHITELIST.split(',').map((ip: string) => ip.trim())
      : [],
  },

  alerts: {
    webhookUrl: process.env.ALERT_WEBHOOK_URL || '',
    gupshupWalletThresholdUsd: parseFloat(
      process.env.GUPSHUP_WALLET_ALERT_THRESHOLD_USD || '50',
    ),
    shopLowBalanceThresholdPaise: parseInt(
      process.env.SHOP_LOW_BALANCE_THRESHOLD_PAISE || '500',
      10,
    ),
    lowBalanceCooldownHours: parseInt(process.env.ALERT_COOLDOWN_HOURS || '12', 10),
  },

  admin: {
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@bizzhouse.com',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@BizzHouse2026',
    name: process.env.DEFAULT_ADMIN_NAME || 'Platform Admin',
  },
});
