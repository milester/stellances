import crypto from 'node:crypto';

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: 'CLIENT' | 'FREELANCER' | 'ADMIN';
  password: string;
  tokenVersion: number;
  stellarPublicKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RefreshTokenRecord = {
  id: string;
  token: string;
  userId: string;
  tokenVersion: number;
  expiresAt: Date;
  revoked: boolean;
  revokedAt?: Date | null;
  replacedByTokenId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function cloneMap<V>(map: Map<string, V>): Map<string, V> {
  return new Map(map);
}

export class PrismaServiceMock {
  private usersById = new Map<string, UserRecord>();
  private usersByEmail = new Map<string, UserRecord>();
  private refreshTokensById = new Map<string, RefreshTokenRecord>();
  private refreshTokensByHash = new Map<string, RefreshTokenRecord>();

  seedUser(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const record: UserRecord = { ...user, createdAt: now, updatedAt: now };
    this.usersById.set(record.id, record);
    this.usersByEmail.set(record.email, record);
  }

  user = {
    findUnique: async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) return this.usersById.get(args.where.id) ?? null;
      if (args.where.email) return this.usersByEmail.get(args.where.email) ?? null;
      return null;
    },

    create: async (args: { data: { email: string; name: string; password: string; role: any } }) => {
      const now = new Date();
      const id = crypto.randomUUID();
      const record: UserRecord = {
        id,
        email: args.data.email,
        name: args.data.name,
        role: args.data.role,
        password: args.data.password,
        tokenVersion: 0,
        stellarPublicKey: null,
        createdAt: now,
        updatedAt: now,
      };
      this.usersById.set(record.id, record);
      this.usersByEmail.set(record.email, record);
      return record;
    },

    update: async (args: { where: { id: string }; data: any }) => {
      const existing = this.usersById.get(args.where.id);
      if (!existing) throw new Error('User not found');
      const now = new Date();

      const tokenVersionIncrement = args.data?.tokenVersion?.increment;
      const updated: UserRecord = {
        ...existing,
        tokenVersion:
          typeof tokenVersionIncrement === 'number'
            ? existing.tokenVersion + tokenVersionIncrement
            : existing.tokenVersion,
        updatedAt: now,
      };

      this.usersById.set(updated.id, updated);
      this.usersByEmail.set(updated.email, updated);
      return updated;
    },
  };

  refreshToken = {
    create: async (args: { data: any }) => {
      const now = new Date();
      const id = crypto.randomUUID();
      const record: RefreshTokenRecord = {
        id,
        token: args.data.token,
        userId: args.data.userId,
        tokenVersion: args.data.tokenVersion,
        expiresAt: args.data.expiresAt,
        revoked: args.data.revoked ?? false,
        revokedAt: args.data.revokedAt ?? null,
        replacedByTokenId: args.data.replacedByTokenId ?? null,
        userAgent: args.data.userAgent ?? null,
        ip: args.data.ip ?? null,
        createdAt: now,
        updatedAt: now,
      };
      if (this.refreshTokensByHash.has(record.token)) {
        throw new Error('Unique constraint failed on RefreshToken.token');
      }
      this.refreshTokensById.set(record.id, record);
      this.refreshTokensByHash.set(record.token, record);
      return record;
    },

    findUnique: async (args: { where: { token: string }; include?: { user?: boolean } }) => {
      const record = this.refreshTokensByHash.get(args.where.token) ?? null;
      if (!record) return null;
      if (args.include?.user) {
        const user = this.usersById.get(record.userId);
        if (!user) throw new Error('RefreshToken.user not found');
        return { ...record, user };
      }
      return record;
    },

    updateMany: async (args: { where: any; data: any }) => {
      let count = 0;
      const now = new Date();

      for (const [id, record] of this.refreshTokensById.entries()) {
        if (args.where?.id && record.id !== args.where.id) continue;
        if (args.where?.userId && record.userId !== args.where.userId) continue;
        if (args.where?.token && record.token !== args.where.token) continue;
        if (typeof args.where?.revoked === 'boolean' && record.revoked !== args.where.revoked) continue;

        const updated: RefreshTokenRecord = {
          ...record,
          revoked: args.data.revoked ?? record.revoked,
          revokedAt: args.data.revokedAt ?? record.revokedAt,
          replacedByTokenId: args.data.replacedByTokenId ?? record.replacedByTokenId,
          updatedAt: now,
        };

        this.refreshTokensById.set(id, updated);
        this.refreshTokensByHash.set(updated.token, updated);
        count += 1;
      }

      return { count };
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    const usersByIdSnapshot = cloneMap(this.usersById);
    const usersByEmailSnapshot = cloneMap(this.usersByEmail);
    const refreshTokensByIdSnapshot = cloneMap(this.refreshTokensById);
    const refreshTokensByHashSnapshot = cloneMap(this.refreshTokensByHash);

    try {
      return await fn(this);
    } catch (err) {
      this.usersById = usersByIdSnapshot;
      this.usersByEmail = usersByEmailSnapshot;
      this.refreshTokensById = refreshTokensByIdSnapshot;
      this.refreshTokensByHash = refreshTokensByHashSnapshot;
      throw err;
    }
  }

  getState() {
    return {
      users: Array.from(this.usersById.values()),
      refreshTokens: Array.from(this.refreshTokensById.values()),
    };
  }
}

