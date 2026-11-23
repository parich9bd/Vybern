import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ServiceRequestType } from '@prisma/client';
import { eyeExamRequestSchema, lensUpgradeRequestSchema, serviceRequestIdempotencySchema } from './service-request.schemas.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const responseSchema = { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'object', required: ['reference', 'status'], additionalProperties: false, properties: { reference: { type: 'string' }, status: { const: 'PENDING' } } } } } as const;

function reference(type: ServiceRequestType): string {
  const prefix = type === ServiceRequestType.EYE_EXAM ? 'EXM' : 'LNS';
  return `VYB-${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function serviceRequestRoutes(app: FastifyInstance): Promise<void> {
  const submit = async (type: ServiceRequestType, request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const header = request.headers['idempotency-key'];
    const idempotencyKey = serviceRequestIdempotencySchema.parse(typeof header === 'string' ? header : '');
    const existing = await app.prisma.serviceRequest.findUnique({ where: { idempotencyKey }, select: { reference: true, status: true } });
    if (existing) return reply.status(200).send({ data: existing });
    try {
      const data = type === ServiceRequestType.EYE_EXAM
        ? { type, idempotencyKey, reference: reference(type), ...eyeExamRequestSchema.parse(request.body) }
        : { type, idempotencyKey, reference: reference(type), ...lensUpgradeRequestSchema.parse(request.body) };
      const created = await app.prisma.serviceRequest.create({ data, select: { reference: true, status: true } });
      return reply.status(201).send({ data: created });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const duplicate = await app.prisma.serviceRequest.findUnique({ where: { idempotencyKey }, select: { reference: true, status: true } });
        if (duplicate) return reply.status(200).send({ data: duplicate });
      }
      throw error;
    }
  };

  app.post('/service-requests/eye-exam', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } }, schema: { tags: ['Services'], summary: 'Submit an eye-examination request', headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 } } }, response: { 200: responseSchema, 201: responseSchema, 400: errorResponse, 429: errorResponse } } }, (request, reply) => submit(ServiceRequestType.EYE_EXAM, request, reply));
  app.post('/service-requests/lens-upgrade', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } }, schema: { tags: ['Services'], summary: 'Submit a lens-upgrade request', headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 } } }, response: { 200: responseSchema, 201: responseSchema, 400: errorResponse, 429: errorResponse } } }, (request, reply) => submit(ServiceRequestType.LENS_UPGRADE, request, reply));
}
