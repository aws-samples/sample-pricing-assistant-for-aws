const productionOrigins = (process.env.FRONTEND_ORIGIN || 'https://your-domain.example.com')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
  },
  s3: {
    bucketName: process.env.S3_BUCKET_NAME || 'aws-pricing-assistant-dev-files-local',
    region: process.env.S3_REGION || 'us-west-2',
    useS3: process.env.USE_S3 === 'true' || process.env.NODE_ENV === 'production',
  },
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? productionOrigins
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  },
};
