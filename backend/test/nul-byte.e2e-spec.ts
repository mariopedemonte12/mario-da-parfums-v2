import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// specs/nul-byte-rejection.md: a NUL byte in any body/query/param string
// must be a 400 CONTAINS_NUL_CHARACTER, never a Postgres 500. Runs against a
// real Postgres because the 500 only exists there (a mocked db accepts NUL).
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

const NUL = String.fromCharCode(0);
const NUL_CODE = 'CONTAINS_NUL_CHARACTER';

describe('NUL byte rejection (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    const { customValidationPipe } =
      await import('../src/pipes/custom-validation.pipe.js');
    const { AllExceptionsFilter } =
      await import('../src/common/filters/http-exception.filter.js');
    app.useGlobalPipes(customValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    adminToken = app.get(JwtService).sign({
      sub: 1,
      email: 'admin@example.com',
      role: Role.ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function expectNul(res: request.Response, field: string) {
    expect(res.status).toBe(400);
    expect(res.body.errors).toContainEqual({
      field,
      errors: [{ code: NUL_CODE }],
    });
  }

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('POST /auths/register with NUL in name -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auths/register')
      .send({
        name: `nul${NUL}user`,
        email: 'nul@example.com',
        password: 'Str0ng!Passw0rd',
      });
    expectNul(res, 'name');
  });

  it('POST /auths/register with NUL in email -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auths/register')
      .send({
        name: 'nuluser',
        email: `nul${NUL}@example.com`,
        password: 'Str0ng!Passw0rd',
      });
    expectNul(res, 'email');
  });

  it('POST /auths/register with NUL in password -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auths/register')
      .send({
        name: 'nuluser',
        email: 'nul@example.com',
        password: `Str0ng!Pass${NUL}w0rd`,
      });
    expectNul(res, 'password');
  });

  it('POST /auths/login with NUL in email -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auths/login')
      .send({ email: `a${NUL}@example.com`, password: 'Str0ng!Passw0rd' });
    expectNul(res, 'email');
  });

  it('POST /auths/admin-register with NUL in name -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auths/admin-register')
      .set(auth())
      .send({
        name: `a${NUL}`,
        email: 'nul2@example.com',
        password: 'Str0ng!Passw0rd',
        role: Role.USER,
      });
    expectNul(res, 'name');
  });

  it('POST /fragrances/batch with NUL in an item -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/fragrances/batch')
      .set(auth())
      .send({ items: [{ name: `Frag${NUL}`, brand: 'Brand' }] });
    expectNul(res, 'items.0.name');
  });

  it('POST /vendors/batch with NUL in an item -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/vendors/batch')
      .set(auth())
      .send({
        items: [{ name: `Vendor${NUL}`, websiteUrl: 'https://v.example.com' }],
      });
    expectNul(res, 'items.0.name');
  });

  it('POST /listings/batch with NUL in an item url -> 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/listings/batch')
      .set(auth())
      .send({
        items: [
          {
            fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            vendorId: 1,
            sizeMl: 100,
            price: 10,
            url: `https://l.example.com/${NUL}`,
          },
        ],
      });
    expectNul(res, 'items.0.url');
  });

  it('GET /fragrances/:id with NUL in the param -> 400 (never 500)', async () => {
    const res = await request(app.getHttpServer()).get('/fragrances/abc%00def');
    expectNul(res, 'id');
  });

  it('GET /fragrances?search=a%00b -> 400', async () => {
    const res = await request(app.getHttpServer()).get(
      '/fragrances?search=a%00b',
    );
    expectNul(res, 'search');
  });

  it('a clean request is unaffected', async () => {
    const res = await request(app.getHttpServer()).get(
      '/fragrances?search=abc',
    );
    expect(res.status).toBe(200);
  });
});
