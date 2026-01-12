import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import type { OrganizationMember } from './OrganizationMember';

@Entity()
export class Organization {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index({ unique: true })
    @Column()
    workosOrganizationId!: string;

    @Column({ length: 200, default: 'Personal Workspace' })
    name!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany('OrganizationMember', 'organization')
    members!: OrganizationMember[];
}
