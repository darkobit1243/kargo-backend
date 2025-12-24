import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/login (POST) - should fail with wrong credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'wrong@user.com', password: 'wrongpass' })
      .expect(401);
    expect(res.body.message).toBeDefined();
  });

  it('/auth/login (POST) - should succeed with correct credentials', async () => {
    // Not: Test ortamında admin@admin.com/admin123 kullanıcısı olmalı
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@admin.com', password: 'admin123' })
      .expect(201);
    expect(res.body.accessToken || res.body.token).toBeDefined();
  });
});
