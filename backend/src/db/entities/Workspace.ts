import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, Index } from 'typeorm';
import type { Agent } from './Agent';
import type { Organization } from './Organization';

@Entity()
export class Workspace {
    @PrimaryGeneratedColumn()
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'varchar',  length: 200, default: 'Untitled' })
    name!: string;

    @Column({ type: "varchar", nullable: true })
    organizationId!: number;

    @ManyToOne('Organization', {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @Column({ type: "varchar", nullable: true })
    githubRepositoryName!: string;

    @Column({ type: 'varchar',  nullable: true })
    workerId?: number;

    @Index()
    @Column({ type: 'varchar',  default: 'main' })
    currentBranch!: string;

    @Column({ type: 'varchar',  nullable: true })
    slackChannelId?: string;

    @Column({ type: 'varchar',  nullable: true })
    slackMessageTs?: string;

    @OneToMany('Agent', 'workspace')
    providerAgents!: Agent[];
}
