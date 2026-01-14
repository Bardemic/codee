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

    @Column()
    userId!: string;

    @ManyToOne(() => Organization, (org) => org.members, {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @Column()
    organizationId!: number;

    @Column({ type: 'varchar', length: 20, default: MemberRole.MEMBER })
    role!: MemberRole;

    @Column()
    userEmail!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
