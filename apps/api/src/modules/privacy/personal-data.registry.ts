import { Global, Injectable, Module } from '@nestjs/common';

/**
 * KVKK "download my data" / "delete my data". Every module that keeps
 * personal data has a contributor for its own tables (ADR 0019).
 */
export interface PersonalDataContributor {
  /** Section name in the export file. */
  readonly section: string;
  /** Lower runs first on erase; identity (the user row itself) runs last. */
  readonly eraseOrder: number;
  export(userId: bigint): Promise<unknown>;
  /** Removes or anonymizes personal content; must be idempotent. */
  erase(userId: bigint): Promise<void>;
}

@Injectable()
export class PersonalDataRegistry {
  private readonly contributors: PersonalDataContributor[] = [];

  register(contributor: PersonalDataContributor): void {
    if (this.contributors.some((c) => c.section === contributor.section)) {
      throw new Error(`Duplicate personal data section ${contributor.section}`);
    }
    this.contributors.push(contributor);
  }

  all(): readonly PersonalDataContributor[] {
    return [...this.contributors].sort((a, b) => a.eraseOrder - b.eraseOrder);
  }
}

@Global()
@Module({ providers: [PersonalDataRegistry], exports: [PersonalDataRegistry] })
export class PersonalDataRegistryModule {}
