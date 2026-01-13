import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import type { OrganizationMember } from './OrganizationMember';

export enum SubscriptionTier {
    FREE = 'FREE',
    PAID = 'PAID',
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

    // Stripe & Subscription fields
    @Column({ nullable: true })
    stripeCustomerId?: string;

    @Column({ nullable: true })
    stripeSubscriptionId?: string;

    @Column({ type: 'varchar', length: 20, default: SubscriptionTier.FREE })
    subscriptionTier!: SubscriptionTier;

    @Column({ type: 'varchar', length: 20, default: SubscriptionStatus.ACTIVE })
    subscriptionStatus!: SubscriptionStatus;

    @Column({ type: 'int', default: 0 })
    messageCount!: number;

    @Column({ type: 'int', default: 10 })
    messageLimit!: number;

    @Column({ type: 'timestamp', nullable: true })
    billingPeriodStart?: Date;

    @Column({ type: 'timestamp', nullable: true })
    billingPeriodEnd?: Date;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany('OrganizationMember', 'organization')
    members!: OrganizationMember[];
}
