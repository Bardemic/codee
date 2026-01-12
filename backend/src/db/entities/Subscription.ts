import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, Index } from 'typeorm';
import type { Organization } from './Organization';

export enum SubscriptionTier {
    FREE = 'FREE',
    PAID = 'PAID',
}

@Entity()
export class Subscription {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index({ unique: true })
    @Column()
    organizationId!: number;

    @OneToOne('Organization')
    @JoinColumn({ name: 'organizationId' })
    organization!: Organization;

    @Column({
        type: 'enum',
        enum: SubscriptionTier,
        default: SubscriptionTier.FREE,
    })
    tier!: SubscriptionTier;

    @Column({ nullable: true })
    stripeCustomerId?: string;

    @Column({ nullable: true })
    stripeSubscriptionId?: string;

    @Column({ nullable: true })
    autumnCustomerId?: string;

    @Column({ type: 'timestamp', nullable: true })
    currentPeriodStart?: Date;

    @Column({ type: 'timestamp', nullable: true })
    currentPeriodEnd?: Date;

    @Column({ default: true })
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
