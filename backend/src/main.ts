import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformResponseInterceptor } from './common/transform-response.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as dns from 'dns';

// Force IPv4-first DNS resolution to eliminate ENETUNREACH errors on cloud container platforms (Render/AWS/Docker)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const frontendUrl = process.env.FRONTEND_URL;

  // Validate FRONTEND_URL in production
  if (isProduction && !frontendUrl) {
    console.error(
      '❌ [CRITICAL PRODUCTION ERROR] FRONTEND_URL environment variable is required for CORS configuration in production mode!',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Configure Express Trust Proxy for Render reverse proxy (1 hop) in production
  if (isProduction) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Allowed Origins for QA and Local Development
  const defaultOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'https://prime-plate-qa.vercel.app',
    'https://primeplate-qa.vercel.app',
  ];

  const allowedOrigins: string[] = [...defaultOrigins];

  if (frontendUrl) {
    const customOrigins = frontendUrl
      .split(',')
      .map((url) => url.trim().replace(/\/$/, ''))
      .filter((url) => url.length > 0);

    customOrigins.forEach((url) => {
      if (!allowedOrigins.includes(url)) {
        allowedOrigins.push(url);
      }
    });
  }

  // Enable CORS prior to middleware, helmet, and route handlers
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, mobile apps, Postman)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('vercel.app')
      ) {
        return callback(null, true);
      }

      // In non-production, allow localhost and private network IPs (192.168.x.x, 10.x.x.x, 172.x.x.x)
      if (!isProduction) {
        const isLocalNetwork =
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
            origin,
          );
        if (isLocalNetwork) {
          return callback(null, true);
        }
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'x-razorpay-signature',
      'x-razorpay-event-id',
    ],
  });

  // Global prefix for versioned API
  app.setGlobalPrefix('api/v1');

  // Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Global Rate Limiter (300 requests / 15 minutes)
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
    }),
  );

  // Tighter Rate Limiter for Authentication & Sensitive Endpoints
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 minutes
    message: {
      success: false,
      message:
        'Too many authentication attempts. Please try again after 15 minutes.',
    },
  });

  app.use('/api/v1/auth/login', authRateLimiter);
  app.use('/api/v1/auth/register', authRateLimiter);
  app.use('/api/v1/auth/refresh', authRateLimiter);
  app.use('/api/v1/auth/forgot-password', authRateLimiter);
  app.use('/api/v1/auth/reset-password', authRateLimiter);

  // Payment creation rate limiter (anti-abuse)
  const paymentRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: {
      success: false,
      message: 'Too many payment requests. Please try again shortly.',
    },
  });

  app.use('/api/v1/payments/create-order', paymentRateLimiter);
  app.use('/api/v1/payments/verify', paymentRateLimiter);

  // Support ticket creation rate limiter (anti-spam)
  const supportRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
      success: false,
      message: 'Too many support ticket requests. Please try again shortly.',
    },
  });

  app.use('/api/v1/support/payment-issues', supportRateLimiter);

  // Global validation and response interceptor
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('PrimePlate API')
    .setDescription('PrimePlate backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // Enable graceful shutdown hooks for clean process exits and scheduler timer cleanups
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 5000;
  await app.listen(port, '0.0.0.0');
  console.log(
    `🚀 PrimePlate NestJS Backend running at http://localhost:${port}/api/v1`,
  );
  console.log(
    `📚 OpenAPI Swagger Documentation: http://localhost:${port}/api/v1/docs`,
  );
}
void bootstrap();
