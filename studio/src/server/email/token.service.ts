import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TokenType, Role } from '@/generated/prisma/enums';
import { AppError } from '../core/errors';

export interface IssueTokenInput {
  type: TokenType;
  email: string;
  userId?: string | null;
  role?: Role | null;
  invitedByName?: string | null;
  ttlMs: number;
}

export interface ConsumedToken {
  email: string;
  userId: string | null;
  role: Role | null;
  invitedByName: string | null;
}

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Issues and consumes single-use, expiring tokens (Priority 4). Only the token hash is
 * persisted; the raw token is returned once (to embed in an emailed link) and never stored.
 */
export class TokenService {
  constructor(private readonly db: PrismaClient) {}

  /** Creates a token, returning the raw value to embed in a link. */
  async issue(input: IssueTokenInput): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.db.token.create({
      data: {
        type: input.type,
        tokenHash: hash(raw),
        email: input.email.toLowerCase(),
        userId: input.userId ?? null,
        role: input.role ?? null,
        invitedByName: input.invitedByName ?? null,
        expiresAt: new Date(Date.now() + input.ttlMs),
      },
    });
    return raw;
  }

  /** Validates + marks a token used (single-use). Throws AppError on invalid/expired/used. */
  async consume(type: TokenType, raw: string): Promise<ConsumedToken> {
    if (!raw) throw AppError.validation('Missing token');
    const record = await this.db.token.findUnique({ where: { tokenHash: hash(raw) } });
    if (!record || record.type !== type) throw AppError.validation('This link is invalid');
    if (record.usedAt) throw AppError.validation('This link has already been used');
    if (record.expiresAt.getTime() < Date.now()) throw AppError.validation('This link has expired');

    await this.db.token.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return { email: record.email, userId: record.userId, role: record.role, invitedByName: record.invitedByName };
  }
}
