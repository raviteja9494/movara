import type { FastifyReply } from 'fastify';
import { TripInputError } from '../../application/use-cases';

export async function mapTripInputError<T>(reply: FastifyReply, operation: () => Promise<T>): Promise<T | FastifyReply> {
  try { return await operation(); }
  catch (error) { if (error instanceof TripInputError) return reply.status(400).send({ error: error.message }); throw error; }
}
