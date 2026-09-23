import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
  // All multi-row marketplace mutations serialize, including reciprocal swipes.
  async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt=0; ;attempt++) {
      try { return await this.$transaction(fn,{isolationLevel:'Serializable'}); }
      catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(e.code) && attempt<4) continue;
        if (e instanceof Prisma.PrismaClientUnknownRequestError && /40P01|40001/.test(e.message) && attempt<4) continue;
        throw e;
      }
    }
  }
}
