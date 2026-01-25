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

    @Column({ type: "varchar", nullable: true })
    userId!: string;

    @ManyToOne(() => Organization, (org) => org.members, {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @Column({ type: "varchar", nullable: true })
    organizationId!: number;

    @Column({ type: 'varchar', length: 20, default: MemberRole.MEMBER })
    role!: MemberRole;

    @Column({ type: "varchar", nullable: true })
    userEmail!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
