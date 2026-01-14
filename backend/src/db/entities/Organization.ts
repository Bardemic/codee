import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import type { OrganizationMember } from './OrganizationMember';

export enum SubscriptionTier {
    FREE = 'FREE',
    PAID = 'PAID',
    ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
    ACTIVE = 'ACTIVE',
    CANCELED = 'CANCELED',
    PAST_DUE = 'PAST_DUE',
    INCOMPLETE = 'INCOMPLETE',
}

@Entity()
export class Organization {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index({ unique: true })
    @Column()
    workosOrganizationId!: string;

    @Column({ length: 200, default: 'Personal Workspace' })
    name!: string;

    // Stripe
    @Column({ nullable: true })
    stripeCustomerId?: string;

    @Column({ nullable: true })
    stripeSubscriptionId?: string;

    @Column({ type: 'varchar', length: 20, default: SubscriptionTier.FREE })
    subscriptionTier!: SubscriptionTier;

    @Column({ type: 'varchar', length: 20, default: SubscriptionStatus.ACTIVE })
    subscriptionStatus!: SubscriptionStatus;

    @Column({ type: 'boolean', default: false })
    cancelAtPeriodEnd!: boolean;

    @Column({ type: 'int', default: 0 })
    tokenCostUsedMicrodollars!: number;

    @Column({ type: 'int', default: 5_000_000 })
    tokenCostLimitMicrodollars!: number;

    @Column({ type: 'int', default: 0 })
    sandboxTimeUsedSeconds!: number;

    @Column({ type: 'int', default: 900 })
    sandboxTimeLimitSeconds!: number;

    @Column({ type: 'timestamp' })
    billingPeriodStart!: Date;

    @Column({ type: 'timestamp' })
    billingPeriodEnd!: Date;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany('OrganizationMember', 'organization')
    members!: OrganizationMember[];
}
