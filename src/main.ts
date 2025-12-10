import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import db from '../db';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
      // eslint-disable-next-line no-console
      console.error('Error running test query:', error);
      res.status(500).send('Database error');
    }
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
