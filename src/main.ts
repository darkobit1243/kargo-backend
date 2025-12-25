import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import * as express from 'express';
import db from '../db';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Base64 foto gibi büyük JSON payload'lar için limitleri yükselt.
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Global validation pipeline
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // TEST amaçlı bir endpoint
  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance();

  expressApp.get('/test', async (req: Request, res: Response) => {
    try {
      const result = await db.query('SELECT NOW()');
      res.send(result.rows);
    } catch (error) {
      console.error('Error running test query:', error);
      res.status(500).send('Database error');
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`[BOOT] Listening on 0.0.0.0:${port}`);
}
bootstrap();
