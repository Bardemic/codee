import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './Organization';

export enum MemberRole {
    OWNER = 'OWNER',
    MEMBER = 'MEMBER',
}

@Entity()
@Index(['userId', 'organizationId'], { unique: true })
export class OrganizationMember {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' })
    userId!: string;

    @ManyToOne(() => Organization, (org) => org.members, {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @Column({ type: 'varchar' })
    organizationId!: number;

    @Column({ type: 'varchar', length: 20, default: MemberRole.MEMBER })
    role!: MemberRole;

    @Column({ type: 'varchar' })
    userEmail!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
