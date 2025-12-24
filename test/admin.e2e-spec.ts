import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AdminController (e2e)', () => {
  let app: INestApplication;
  let jwt: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Test için bir admin kullanıcısı ile login ol (gerekirse test user oluşturulabilir)
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@admin.com', password: 'admin123' });
    jwt = loginRes.body?.accessToken || loginRes.body?.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/admin/stats (GET) - should return stats for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('listings');
    expect(res.body).toHaveProperty('deliveries');
  });

  it('/admin/users (GET) - should return paginated users', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
  });
});
